import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchItems, updateItemStatus, updateItemContact, invalidateDriveCache } from '../api/items';
import { fetchCategories, createCategory, updateCategoryName, deleteCategory, reorderCategories } from '../api/categories';
import type { ItemCategory } from '../api/categories';
import { fetchReservations, upsertReservation, deleteReservation } from '../api/reservations';
import { generateBuyerPickupLink } from '../utils/whatsapp';
import type { YardSaleItem, ItemStatus, ItemContact, Reservation } from '../types';
import AnalyticsDashboard from './AnalyticsDashboard';
import { useGoogleOAuth } from '../hooks/useGoogleOAuth';
import { uploadToDrive, listDriveFiles, driveThumbUrl, driveFileIdFromUrl, syncItemDriveImages } from '../api/drive-admin';
import type { DriveFile } from '../api/drive-admin';
import {
  readAllRows, parseHeaders, findRow,
  getNextItemId, appendRow, updateRow, ensureColumns,
} from '../api/sheets-admin';

import {
  DndContext, closestCenter,
  KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove, SortableContext,
  sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function itemToSheetValues(item: Partial<YardSaleItem> & { id: string | number }): Record<string, string> {
  return {
    id: String(item.id),
    title: item.title ?? '',
    description: item.description ?? '',
    price: String(item.price ?? ''),
    condition: item.condition ?? '',
    category: item.category ?? '',
    status: item.status ?? 'available',
    images: Array.isArray(item.images) ? item.images.join(',') : '',
    dimensions: item.dimensions ?? '',
    fbMarketplaceLink: item.fbMarketplaceLink ?? '',
    contact: item.contact ?? 'evya',
    display_order: String(item.display_order ?? 0),
    delivery_time: item.delivery_time ?? 'flexible',
    original_price: item.originalPrice ? String(item.originalPrice) : '',
    brand: item.brand ?? '',
    model: item.model ?? '',
    hidden: item.hidden ? 'true' : '',
    sold_at: item.sold_at ?? '',
  };
}

// ── Item row ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'bg-[#1D6B5E]/10 text-[#1D6B5E] border-[#1D6B5E]' },
  pending:   { label: 'Pending',   cls: 'bg-[#C47D1A]/10 text-[#C47D1A] border-[#C47D1A]' },
  sold:      { label: 'Sold',      cls: 'bg-stone/15 text-stone border-stone' },
};

interface RowHandlers {
  onDelete: (item: YardSaleItem) => void;
  onEdit: (item: YardSaleItem) => void;
  onHide: (item: YardSaleItem) => void;
  onStatusChange: (id: string, s: ItemStatus) => void;
  onContactChange: (id: string, c: ItemContact) => void;
  onReserve: (item: YardSaleItem) => void;
}

/** DD/MM/YYYY from a YYYY-MM-DD string, for compact admin display. */
function formatDateShort(date?: string | null): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return d && m && y ? `${d}/${m}/${y}` : date;
}

/** Presentational row content, shared by the draggable and static variants. */
function ItemRowInner({ item, handlers, reservation, dragHandle }: {
  item: YardSaleItem;
  handlers: RowHandlers;
  reservation?: Reservation;
  dragHandle?: React.ReactNode;
}) {
  const status = STATUS_META[item.status];
  return (
    <>
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        {dragHandle}
        <div className="w-16 h-16 shrink-0 border-[2px] border-jet bg-white overflow-hidden">
          {item.images?.[0]
            ? <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-stone text-[10px] font-bold uppercase">No img</div>}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base sm:text-lg leading-tight truncate max-w-full">{item.title}</h3>
            {item.hidden && <span className="text-[10px] font-bold bg-stone/20 text-stone px-2 py-0.5 uppercase tracking-wider shrink-0">Hidden</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider ${status.cls}`}>{status.label}</span>
            <span className="font-mono text-stone text-sm">₪{item.price}</span>
            <span className="font-mono text-stone/60 text-xs">#{item.id}</span>
            {reservation && (
              <span className="text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]">★ שמור</span>
            )}
          </div>
          {reservation && (
            <div dir="rtl" className="mt-1.5 text-[11px] text-stone leading-snug flex flex-wrap gap-x-3 gap-y-0.5">
              {reservation.buyer_name && <span className="font-bold text-jet">{reservation.buyer_name}</span>}
              {reservation.sale_price != null && <span>סגירה: ₪{reservation.sale_price}</span>}
              {reservation.amount != null && <span>מקדמה: ₪{reservation.amount}</span>}
              {(() => { const bal = reservationBalance(reservation); return bal != null ? <span className="font-bold text-[#B91C1C]">יתרה: ₪{bal}</span> : null; })()}
              {reservation.pickup_date && <span>איסוף: {formatDateShort(reservation.pickup_date)}</span>}
              {reservation.buyer_phone && <span className="font-mono" dir="ltr">{reservation.buyer_phone}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-3 sm:mt-0 sm:justify-end shrink-0">
        {reservation && reservation.buyer_phone && (
          <a
            href={generateBuyerPickupLink(reservation.buyer_phone, item.title, reservation.buyer_name, reservation.pickup_date, reservationBalance(reservation))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 border-[2px] border-[#25D366] bg-[#25D366] text-white p-2 font-bold hover:opacity-90 transition-opacity px-3 uppercase tracking-wide text-xs"
            title="שלח וואטסאפ לקונה — מוכן לאיסוף"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.005c6.581 0 11.943-5.334 11.945-11.892a11.821 11.821 0 00-3.48-8.464"/></svg>
            לאיסוף
          </a>
        )}
        <button onClick={() => handlers.onReserve(item)} className="flex-1 sm:flex-none border-[2px] border-[#7C3AED] text-[#7C3AED] bg-transparent p-2 font-bold hover:bg-[#7C3AED] hover:text-white transition-colors px-4 uppercase tracking-wide text-xs" title={reservation ? 'ערוך שמירה' : 'שמור מוצר לקונה'}>{reservation ? '✎ שמירה' : '★ שמור'}</button>
        <button onClick={() => handlers.onEdit(item)} className="flex-1 sm:flex-none border-[2px] border-jet bg-jet text-surface p-2 font-bold hover:bg-stone transition-colors px-4 uppercase tracking-wide text-xs">Edit</button>
        <label className="flex-1 sm:flex-none flex flex-col gap-0.5">
          <span className="text-[8px] font-bold uppercase tracking-widest text-stone sm:hidden">Status</span>
          <select value={item.status} onChange={e => handlers.onStatusChange(item.id, e.target.value as ItemStatus)} className="border-[2px] border-jet bg-surface p-2 font-bold cursor-pointer outline-none hover:bg-oatmeal transition-colors text-sm">
            <option value="available">Available</option>
            <option value="pending">Pending</option>
            <option value="sold">Sold</option>
          </select>
        </label>
        <label className="flex-1 sm:flex-none flex flex-col gap-0.5">
          <span className="text-[8px] font-bold uppercase tracking-widest text-stone sm:hidden">Contact</span>
          <select value={item.contact} onChange={e => handlers.onContactChange(item.id, e.target.value as ItemContact)} className="border-[2px] border-jet bg-surface p-2 font-bold cursor-pointer outline-none hover:bg-oatmeal transition-colors text-sm">
            <option value="evya">Evya</option>
            <option value="hadas">Hadas</option>
          </select>
        </label>
        <button onClick={() => handlers.onHide(item)} className="border-[2px] border-stone text-stone bg-transparent p-2 font-bold hover:bg-stone hover:text-surface transition-colors px-3 text-xs uppercase tracking-wide" title={item.hidden ? 'Show on storefront' : 'Hide from storefront'}>{item.hidden ? 'Show' : 'Hide'}</button>
        <button onClick={() => handlers.onDelete(item)} className="border-[2px] border-red-600 text-red-600 bg-transparent p-2 font-bold hover:bg-red-600 hover:text-white transition-colors px-3 text-xs uppercase tracking-wide">Del</button>
      </div>
    </>
  );
}

function SortableItem({ item, reservation, ...handlers }: { item: YardSaleItem; reservation?: Reservation } & RowHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface border-[3px] border-jet p-3 sm:p-5 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center shadow-[4px_4px_0px_theme(colors.jet)] ${isDragging ? 'shadow-none' : ''} ${item.hidden ? 'opacity-60' : ''}`}
    >
      <ItemRowInner
        item={item}
        handlers={handlers}
        reservation={reservation}
        dragHandle={
          <div
            {...attributes} {...listeners}
            className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 hover:bg-oatmeal border-[2px] border-transparent hover:border-jet transition-colors text-stone hover:text-jet shrink-0 touch-none"
            title="Drag to reorder"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>
        }
      />
    </div>
  );
}

function StaticItem({ item, reservation, ...handlers }: { item: YardSaleItem; reservation?: Reservation } & RowHandlers) {
  return (
    <div className={`bg-surface border-[3px] border-jet p-3 sm:p-5 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center shadow-[4px_4px_0px_theme(colors.jet)] ${item.hidden ? 'opacity-60' : ''}`}>
      <ItemRowInner item={item} handlers={handlers} reservation={reservation} />
    </div>
  );
}

// ── SortableCategoryRow ───────────────────────────────────────────────────────

function SortableCategoryRow({ category, onDelete, onEditName }: {
  category: ItemCategory;
  onDelete: (name: string) => void;
  onEditName: (old: string, next: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.name });
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(category.name);
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, position: 'relative' as const, opacity: isDragging ? 0.5 : 1 };

  const save = () => {
    if (editVal.trim() && editVal !== category.name) onEditName(category.name, editVal.trim());
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-surface border-[2px] border-jet p-4 flex gap-4 justify-between items-center shadow-[2px_2px_0px_theme(colors.jet)] ${isDragging ? 'shadow-none' : ''}`}>
      <div className="flex items-center gap-4 flex-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-oatmeal text-stone hover:text-jet transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        {isEditing
          ? <input type="text" autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} className="flex-1 border-[2px] border-jet px-2 py-1 outline-none font-bold" />
          : <span className="font-bold flex-1 text-lg">{category.name}</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setIsEditing(!isEditing)} className="text-sm font-bold border-b-2 border-jet hover:text-stone transition-colors px-1">{isEditing ? 'Save' : 'Rename'}</button>
        <button onClick={() => onDelete(category.name)} className="text-sm font-bold text-red-600 border-b-2 border-red-600 hover:text-red-400 transition-colors px-1">Delete</button>
      </div>
    </div>
  );
}

// ── Form field wrapper ────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-widest text-stone mb-1.5 flex items-center gap-1">
        {label}{required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-stone mt-1 block leading-snug">{hint}</span>}
    </label>
  );
}

const INPUT_CLS = 'w-full p-3 border-[2px] border-jet bg-white outline-none focus:bg-[#A8B5A1]/10 transition-colors';

// ── Main Dashboard ────────────────────────────────────────────────────────────

const EMPTY_FORM: Partial<YardSaleItem> = {
  title: '', description: '', price: 0, condition: '', category: '',
  status: 'available', images: [], dimensions: '', contact: 'hadas',
  delivery_time: 'flexible', originalPrice: undefined, brand: '', model: '',
};

// Reservation form uses string fields so inputs stay controlled; converted on save.
interface ReservationForm {
  sale_price: string;
  amount: string;
  pickup_date: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_facebook: string;
  notes: string;
}

const EMPTY_RESERVATION: ReservationForm = {
  sale_price: '', amount: '', pickup_date: '', buyer_name: '', buyer_phone: '', buyer_facebook: '', notes: '',
};

/** Remaining balance = agreed sale price − prepayment received (never negative). */
function reservationBalance(res: Pick<Reservation, 'sale_price' | 'amount'>): number | null {
  if (res.sale_price == null) return null;
  return Math.max(0, res.sale_price - (res.amount ?? 0));
}

export default function AdminDashboard() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<YardSaleItem[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  // Reservations keyed by Sheet item id (private buyer details live in Supabase).
  const [reservations, setReservations] = useState<Map<string, Reservation>>(new Map());
  const [reservingItem, setReservingItem] = useState<YardSaleItem | null>(null);
  const [resForm, setResForm] = useState<ReservationForm>(EMPTY_RESERVATION);
  const [savingReservation, setSavingReservation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inventory' | 'analytics' | 'categories'>('inventory');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ItemStatus | 'hidden'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<YardSaleItem>>(EMPTY_FORM);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sheetsRows, setSheetsRows] = useState<string[][] | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [drivePickerLoading, setDrivePickerLoading] = useState(false);
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());
  // Existing Drive photos queued for import into the current item (renamed into
  // the item's naming convention on save).
  const [driveImports, setDriveImports] = useState<DriveFile[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { token: googleToken, requestAccess: connectGoogle, revokeAccess: disconnectGoogle, hasClientId } = useGoogleOAuth();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadItems(); }, [session]);

  const loadItems = async () => {
    setLoading(true);
    const [data, cats, resList] = await Promise.all([fetchItems(), fetchCategories(), fetchReservations()]);
    setItems(data);
    setCategories(cats);
    setReservations(new Map(resList.map(r => [String(r.item_id), r])));
    setLoading(false);
  };

  // ── Sheets row cache ────────────────────────────────────────────────────────

  const getSheetRows = async (forceRefresh = false): Promise<string[][]> => {
    if (!googleToken) throw new Error('Not connected to Google');
    if (!forceRefresh && sheetsRows) return sheetsRows;
    const rows = await readAllRows(googleToken);
    setSheetsRows(rows);
    return rows;
  };

  // ── Auth ────────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  // ── AI Analysis ─────────────────────────────────────────────────────────────

  const handleAIAnalysis = async () => {
    if (imageFiles.length === 0) { alert('Take or select at least one photo first.'); return; }

    setIsAnalyzing(true);
    try {
      // Send images to the server-side proxy so the Gemini key never reaches the client.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Your session expired — please sign in again.'); return; }

      const images = await Promise.all(
        imageFiles.slice(0, 3).map(async f => ({
          data: await fileToBase64(f),
          mimeType: f.type,
        }))
      );

      const res = await fetch('/api/analyze-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ images }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: '' }));
        alert(error === 'AI not configured'
          ? 'AI is not configured on the server (set GEMINI_API_KEY in Vercel).'
          : 'AI analysis failed — please fill the form manually.');
        return;
      }

      const parsed = await res.json();
      setFormData(prev => ({
        ...prev,
        title: parsed.title || prev.title,
        description: parsed.description || prev.description,
        condition: parsed.condition || prev.condition,
        category: parsed.category || prev.category,
        brand: parsed.brand || prev.brand,
        model: parsed.model || prev.model,
        originalPrice: parsed.originalPrice > 0 ? parsed.originalPrice : prev.originalPrice,
      }));
    } catch (err) {
      console.error('AI analysis failed:', err);
      alert('AI analysis failed — check console for details.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Image handling ──────────────────────────────────────────────────────────

  const addImages = (files: FileList | null) => {
    if (!files) return;
    setImageFiles(prev => [...prev, ...Array.from(files)]);
  };

  const openDrivePicker = async () => {
    if (!googleToken) { alert('Connect Google first.'); return; }
    setShowDrivePicker(true);
    setSelectedDriveIds(new Set());
    // Always refresh: the folder contents change as photos are uploaded and
    // imports rename files, so a cached list quickly goes stale.
    setDrivePickerLoading(true);
    try {
      const files = await listDriveFiles(googleToken);
      setDriveFiles(files);
    } catch (err) {
      console.error('Drive list failed:', err);
      alert('Could not load Drive files. Check console.');
    } finally {
      setDrivePickerLoading(false);
    }
  };

  const confirmDriveSelection = () => {
    const picked = driveFiles.filter(f => selectedDriveIds.has(f.id));
    setDriveImports(prev => {
      const seen = new Set(prev.map(f => f.id));
      return [...prev, ...picked.filter(f => !seen.has(f.id))];
    });
    setShowDrivePicker(false);
    setSelectedDriveIds(new Set());
  };

  const toggleDriveFile = (id: string) => {
    setSelectedDriveIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Item CRUD ───────────────────────────────────────────────────────────────

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleToken) { alert('Connect your Google account first (see the banner above).'); return; }
    if (!formData.title || !formData.description || !formData.price || !formData.category) {
      alert('Please fill out all required fields (title, description, price, category).');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Determine item ID
      const itemId = editingId ?? await getNextItemId(googleToken);

      // 2. Reconcile the item's Drive photos to match the form, in order.
      //    The desired set = the existing Drive photos still shown in the form
      //    (kept order — index 0 is the cover), then any newly uploaded files,
      //    then photos imported from the Drive picker. Uploads go up with a
      //    temporary name; syncItemDriveImages renames every kept/new/imported
      //    file into consecutive convention names and deletes the ones removed
      //    from the form, so add / remove / reorder / set-cover all take effect.
      const existingDriveIds = (formData.images ?? [])
        .filter(u => u.includes('drive.google.com'))
        .map(driveFileIdFromUrl)
        .filter((id): id is string => !!id);

      const uploadedIds: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const ext = imageFiles[i].name.split('.').pop()?.toLowerCase() ?? 'jpg';
        uploadedIds.push(
          await uploadToDrive(googleToken, imageFiles[i], `${itemId}-tmp-upload-${Date.now()}-${i}.${ext}`),
        );
      }

      const orderedDriveIds = [...existingDriveIds, ...uploadedIds, ...driveImports.map(f => f.id)];

      let driveUrls: string[] = [];
      if (orderedDriveIds.length > 0 || editingId) {
        driveUrls = await syncItemDriveImages(googleToken, itemId, orderedDriveIds);
      }
      invalidateDriveCache(); // public storefront picks up the changes on next load

      // 3. Build sheet values — Drive images are discovered by naming convention,
      //    so the `images` column only stores external URLs added manually.
      const existingSheetImages = editingId
        ? (formData.images?.filter(u => !u.includes('drive.google.com')) ?? [])
        : [];
      const maxDisplayOrder = items.length > 0
        ? Math.max(...items.map(i => i.display_order ?? 0))
        : 0;

      const sheetValues = itemToSheetValues({
        ...formData,
        id: itemId,
        images: existingSheetImages,
        display_order: editingId
          ? (formData.display_order ?? 0)
          : maxDisplayOrder + 1,
      });

      // 4. Write to Sheets
      const allRows = await getSheetRows(true);
      const headers = await ensureColumns(googleToken, allRows, ['sold_at']);

      let success: boolean;
      if (editingId) {
        const rowIdx = findRow(allRows, editingId);
        if (rowIdx === -1) { alert('Item not found in spreadsheet.'); return; }
        success = await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], sheetValues);
      } else {
        success = await appendRow(googleToken, headers, sheetValues);
      }

      if (!success) { alert('Failed to write to Google Sheets. Check console.'); return; }

      setSheetsRows(null);

      // 5. Update local state — Drive photos first (cover leads), then external
      //    URLs, matching the storefront's ordering.
      const allImages = [...driveUrls, ...existingSheetImages];

      if (editingId) {
        setItems(prev => prev.map(i =>
          i.id === editingId
            ? { ...i, ...formData, images: allImages } as YardSaleItem
            : i
        ));
      } else {
        const newItem: YardSaleItem = {
          id: itemId,
          title: formData.title!,
          description: formData.description ?? '',
          price: Number(formData.price),
          condition: formData.condition ?? '',
          category: formData.category!,
          status: 'available',
          images: allImages,
          dimensions: formData.dimensions,
          fbMarketplaceLink: formData.fbMarketplaceLink,
          contact: (formData.contact as ItemContact) ?? 'hadas',
          display_order: maxDisplayOrder + 1,
          delivery_time: (formData.delivery_time as 'flexible' | 'departure') ?? 'flexible',
          originalPrice: formData.originalPrice,
          brand: formData.brand,
          model: formData.model,
        };
        setItems(prev => [newItem, ...prev]);
      }

      setShowForm(false);
      setImageFiles([]);
      setDriveImports([]);
    } catch (err) {
      console.error('Save failed:', err);
      // Surface the real reason on-screen — admins use this on mobile, where
      // there is no console to "check".
      const detail = err instanceof Error ? err.message : String(err);
      alert(`Could not save the item:\n\n${detail}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ItemStatus) => {
    // Stamp sold_at when an item first becomes sold; clear it when it leaves
    // sold. Preserve an existing timestamp so re-saving a sold item keeps order.
    const prevItem = items.find(i => i.id === id);
    const nowSold = newStatus === 'sold';
    const soldAt = nowSold
      ? (prevItem?.status === 'sold' ? (prevItem.sold_at ?? new Date().toISOString()) : new Date().toISOString())
      : '';

    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus, sold_at: soldAt || undefined } : i));
    // Sync to Sheets
    if (googleToken) {
      try {
        const allRows = await getSheetRows();
        const headers = await ensureColumns(googleToken, allRows, ['sold_at']);
        const rowIdx = findRow(allRows, id);
        if (rowIdx !== -1) {
          await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], { status: newStatus, sold_at: soldAt });
          setSheetsRows(null);
        }
      } catch (err) { console.error('Status sync failed:', err); }
    }
    // Also write to Supabase for backwards-compat analytics
    updateItemStatus(id, newStatus);
  };

  const handleContactChange = async (id: string, newContact: ItemContact) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, contact: newContact } : i));
    if (googleToken) {
      try {
        const allRows = await getSheetRows();
        const { headers } = parseHeaders(allRows);
        const rowIdx = findRow(allRows, id);
        if (rowIdx !== -1) {
          await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], { contact: newContact });
          setSheetsRows(null);
        }
      } catch (err) { console.error('Contact sync failed:', err); }
    }
    updateItemContact(id, newContact);
  };

  // ── Reservations ─────────────────────────────────────────────────────────────

  const openReserveModal = (item: YardSaleItem) => {
    const existing = reservations.get(item.id);
    setResForm(existing
      ? {
          sale_price: existing.sale_price != null ? String(existing.sale_price) : '',
          amount: existing.amount != null ? String(existing.amount) : '',
          pickup_date: existing.pickup_date ?? '',
          buyer_name: existing.buyer_name ?? '',
          buyer_phone: existing.buyer_phone ?? '',
          buyer_facebook: existing.buyer_facebook ?? '',
          notes: existing.notes ?? '',
        }
      // New reservation: pre-fill the agreed price with the item's listed price.
      : { ...EMPTY_RESERVATION, sale_price: item.price ? String(item.price) : '' });
    setReservingItem(item);
  };

  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservingItem) return;
    if (!resForm.buyer_name.trim()) { alert('אנא הזן את שם הקונה.'); return; }

    setSavingReservation(true);
    try {
      const saved = await upsertReservation({
        item_id: reservingItem.id,
        item_title: reservingItem.title,
        sale_price: resForm.sale_price.trim() === '' ? null : Number(resForm.sale_price),
        amount: resForm.amount.trim() === '' ? null : Number(resForm.amount),
        pickup_date: resForm.pickup_date || null,
        buyer_name: resForm.buyer_name,
        buyer_phone: resForm.buyer_phone,
        buyer_facebook: resForm.buyer_facebook,
        notes: resForm.notes,
      });
      if (!saved) { alert('שמירת הפרטים נכשלה. בדוק את החיבור ונסה שוב.'); return; }

      setReservations(prev => new Map(prev).set(reservingItem.id, saved));

      // Reserving an item takes it off the market — mark it sold (Sheet + Supabase).
      if (reservingItem.status !== 'sold') {
        await handleStatusChange(reservingItem.id, 'sold');
      }

      setReservingItem(null);
    } catch (err) {
      console.error('Reservation save failed:', err);
      alert(`שמירת הפרטים נכשלה:\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingReservation(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!reservingItem) return;
    if (!window.confirm(`לבטל את השמירה של "${reservingItem.title}"? פרטי הקונה יימחקו.`)) return;
    setSavingReservation(true);
    try {
      const ok = await deleteReservation(reservingItem.id);
      if (!ok) { alert('ביטול השמירה נכשל.'); return; }
      setReservations(prev => {
        const next = new Map(prev);
        next.delete(reservingItem.id);
        return next;
      });
      setReservingItem(null);
    } finally {
      setSavingReservation(false);
    }
  };

  const handleHideItem = async (item: YardSaleItem) => {
    if (!googleToken) { alert('Connect Google first to hide/show items in the spreadsheet.'); return; }
    const newHidden = !item.hidden;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, hidden: newHidden } : i));
    try {
      const allRows = await getSheetRows();
      const { headers } = parseHeaders(allRows);
      const rowIdx = findRow(allRows, item.id);
      if (rowIdx !== -1) {
        await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], { hidden: newHidden ? 'true' : '' });
        setSheetsRows(null);
      }
    } catch (err) {
      console.error('Hide sync failed:', err);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, hidden: !newHidden } : i));
    }
  };

  const handleDeleteItem = async (item: YardSaleItem) => {
    if (!window.confirm(`Permanently hide "${item.title}" from the storefront?`)) return;
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (googleToken) {
      try {
        const allRows = await getSheetRows();
        const { headers } = parseHeaders(allRows);
        const rowIdx = findRow(allRows, item.id);
        if (rowIdx !== -1) {
          await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], { hidden: 'true', status: 'sold' });
          setSheetsRows(null);
        }
      } catch (err) { console.error('Delete sync failed:', err); }
    }
  };

  // ── Reorder ─────────────────────────────────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (activeTab === 'inventory') {
      // Only the available (non-sold) items are draggable; sold items live in a
      // separate, fixed section. Reorder within the available list only.
      const active_ = items.filter(i => i.status !== 'sold');
      const sold = items.filter(i => i.status === 'sold');
      const oldIndex = active_.findIndex(i => i.id === active.id);
      const newIndex = active_.findIndex(i => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(active_, oldIndex, newIndex).map((item, idx, arr) => ({
        ...item,
        display_order: arr.length - idx,
      }));
      setItems([...reordered, ...sold]);

      if (googleToken) {
        try {
          const allRows = await getSheetRows();
          const { headers } = parseHeaders(allRows);
          for (const item of reordered) {
            const rowIdx = findRow(allRows, item.id);
            if (rowIdx !== -1) {
              await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], {
                display_order: String(item.display_order),
              });
            }
          }
          setSheetsRows(null);
        } catch (err) { console.error('Reorder sync failed:', err); }
      }
    } else if (activeTab === 'categories') {
      const oldIndex = categories.findIndex(c => c.name === active.id);
      const newIndex = categories.findIndex(c => c.name === over.id);
      const newCats = arrayMove(categories, oldIndex, newIndex);
      setCategories(newCats);
      const updates = newCats.map((cat, i) => ({ ...cat, display_order: i + 1 }));
      const ok = await reorderCategories(updates);
      if (!ok) { alert('Failed to save category order.'); loadItems(); }
    }
  };

  // ── Category CRUD ────────────────────────────────────────────────────────────

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const name = newCatName.trim();
    if (categories.find(c => c.name === name)) { alert('Category already exists!'); return; }
    const order = categories.length > 0 ? Math.max(...categories.map(c => c.display_order)) + 1 : 1;
    const ok = await createCategory(name, order);
    if (ok) { setCategories([...categories, { name, display_order: order }]); setNewCatName(''); }
    else alert('Failed to create category');
  };

  const handleDeleteCategory = async (name: string) => {
    if (items.some(i => i.category === name)) {
      alert(`Cannot delete "${name}" — it has items. Reassign them first.`);
      return;
    }
    if (window.confirm(`Delete category "${name}"?`)) {
      const ok = await deleteCategory(name);
      if (ok) setCategories(categories.filter(c => c.name !== name));
      else alert('Delete failed');
    }
  };

  const handleEditCategoryName = async (oldName: string, newName: string) => {
    if (categories.find(c => c.name === newName)) { alert('Category already exists!'); return; }
    const ok = await updateCategoryName(oldName, newName);
    if (ok) {
      setCategories(categories.map(c => c.name === oldName ? { ...c, name: newName } : c));
      setItems(items.map(i => i.category === oldName ? { ...i, category: newName } : i));
    } else alert('Rename failed');
  };

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, category: categories[0]?.name || '' });
    setImageFiles([]);
    setDriveImports([]);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditForm = (item: YardSaleItem) => {
    setEditingId(item.id);
    setFormData({ ...item });
    setImageFiles([]);
    setDriveImports([]);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Moves a photo to the front (cover). The change is staged in the form and
  // committed to Drive on Save, where syncItemDriveImages renames the files into
  // the new order so the storefront's cover (the bare `{id}` file) updates.
  const handleMakeCoverExisting = (idx: number) => {
    if (!formData.images || idx === 0) return;
    const imgs = [...formData.images];
    const [picked] = imgs.splice(idx, 1);
    setFormData(prev => ({ ...prev, images: [picked, ...imgs] }));
  };

  const handleMakeCoverNewFile = (idx: number) => {
    const files = [...imageFiles];
    const [t] = files.splice(idx, 1);
    setImageFiles([t, ...files]);
  };

  // ── Login screen ─────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div className="min-h-screen bg-oatmeal flex px-4 items-center justify-center">
        <form onSubmit={handleLogin} className="max-w-md w-full bg-surface p-8 border-[3px] border-jet shadow-[6px_6px_0px_theme(colors.jet)]">
          <Link to="/" className="text-sm font-bold underline mb-8 block">&larr; Back to Store</Link>
          <h2 className="text-2xl font-bold bg-jet text-surface inline-block px-4 py-2 border-[2px] border-jet mb-8 uppercase tracking-widest">Admin Login</h2>
          <div className="space-y-4">
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 border-[2px] border-jet bg-surface font-mono outline-none focus:bg-[#A8B5A1]/20 transition-colors" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 border-[2px] border-jet bg-surface font-mono outline-none focus:bg-[#A8B5A1]/20 transition-colors" />
            <button type="submit" className="w-full bg-jet text-surface font-bold py-4 mt-4 hover:bg-jet border-[2px] border-jet transition-colors uppercase tracking-widest">Login</button>
          </div>
        </form>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  // Inventory counts + filtering
  const counts = {
    all: items.length,
    available: items.filter(i => i.status === 'available' && !i.hidden).length,
    pending: items.filter(i => i.status === 'pending').length,
    sold: items.filter(i => i.status === 'sold').length,
    hidden: items.filter(i => i.hidden).length,
  };
  const q = search.trim().toLowerCase();
  const matchesStatus = (i: YardSaleItem) =>
    statusFilter === 'all' ? true
    : statusFilter === 'hidden' ? !!i.hidden
    : i.status === statusFilter;
  const matchesSearch = (i: YardSaleItem) =>
    !q || i.title.toLowerCase().includes(q) || String(i.id).toLowerCase().includes(q) || (i.brand ?? '').toLowerCase().includes(q);
  const visibleItems = items.filter(i => matchesStatus(i) && matchesSearch(i));
  const isFiltering = statusFilter !== 'all' || q !== '';

  // Default (unfiltered) inventory view splits into a draggable available list
  // and a fixed, newest-first sold section.
  const activeItems = items.filter(i => i.status !== 'sold');
  const soldItems = items
    .filter(i => i.status === 'sold')
    .sort((a, b) => (b.sold_at ? Date.parse(b.sold_at) : 0) - (a.sold_at ? Date.parse(a.sold_at) : 0)
      || (b.display_order ?? 0) - (a.display_order ?? 0));

  // Drive picker: hide files already queued for import, and (when editing) the
  // item's own convention images — re-importing those would leave a naming gap.
  const belongsToEditingItem = (name: string) => {
    if (!editingId) return false;
    const base = name.replace(/\.(jpe?g|png|webp)$/i, '');
    return base === editingId || base.startsWith(`${editingId}-`);
  };
  const pickableFiles = driveFiles.filter(
    f => !driveImports.some(d => d.id === f.id) && !belongsToEditingItem(f.name),
  );

  const filterChips: { key: 'all' | ItemStatus | 'hidden'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'available', label: 'Available', count: counts.available },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'sold', label: 'Sold', count: counts.sold },
    { key: 'hidden', label: 'Hidden', count: counts.hidden },
  ];

  const rowHandlers: RowHandlers = {
    onDelete: handleDeleteItem,
    onEdit: openEditForm,
    onHide: handleHideItem,
    onStatusChange: handleStatusChange,
    onContactChange: handleContactChange,
    onReserve: openReserveModal,
  };

  return (
    <>
    <div className="min-h-screen bg-oatmeal py-10 px-4 sm:px-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-end mb-6 border-b-[3px] border-jet pb-4 flex-wrap gap-4">
          <h1 className="text-2xl sm:text-4xl font-bold text-jet uppercase tracking-widest">Store Dashboard</h1>
          <div className="flex gap-4">
            <Link to="/" className="font-bold underline text-stone hover:text-jet self-center mr-4">View Storefront</Link>
            <button onClick={() => supabase.auth.signOut()} className="font-bold underline text-stone hover:text-jet self-center ml-2">Sign Out</button>
          </div>
        </div>

        {/* Google Connect Banner */}
        <div className={`mb-6 p-4 border-[2px] flex items-center justify-between gap-4 flex-wrap ${googleToken ? 'border-[#16A34A] bg-[#16A34A]/5' : 'border-amber-500 bg-amber-50'}`}>
          <div>
            <p className="font-bold text-sm uppercase tracking-wide">
              {googleToken ? '✅ Google Connected — Sheets & Drive sync active' : '⚠️ Google not connected — connect to enable add/edit/hide/reorder sync'}
            </p>
            <p className="text-xs text-stone mt-0.5">
              {googleToken
                ? 'Changes you make will be written directly to the Google Sheet and Drive folder.'
                : hasClientId
                  ? 'Click Connect to authorise write access to your Google Sheet and Drive folder.'
                  : 'Set VITE_GOOGLE_CLIENT_ID in .env.local, then restart the dev server.'}
            </p>
          </div>
          <button
            onClick={googleToken ? disconnectGoogle : connectGoogle}
            disabled={!hasClientId}
            className={`font-bold border-[2px] px-5 py-2.5 text-sm uppercase tracking-widest transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              googleToken
                ? 'border-[#16A34A] text-[#16A34A] hover:bg-[#16A34A] hover:text-white'
                : 'border-amber-600 text-amber-700 hover:bg-amber-500 hover:text-white'
            }`}
          >
            {googleToken ? 'Disconnect' : hasClientId ? 'Connect Google' : 'Set Client ID first'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-8 w-full overflow-x-auto border-[2px] border-jet">
          {(['inventory', 'categories', 'analytics'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setShowForm(false); }}
              className={`px-4 sm:px-6 py-2.5 font-bold uppercase tracking-widest text-xs sm:text-sm transition-colors whitespace-nowrap flex-1 text-center border-r-[2px] last:border-r-0 border-jet ${
                activeTab === tab ? 'bg-jet text-surface' : 'bg-surface text-jet hover:bg-oatmeal'
              }`}
            >
              {tab === 'inventory' ? '📦 Inventory' : tab === 'categories' ? '🗂 Categories' : '📊 Analytics'}
            </button>
          ))}
        </div>

        {/* Analytics tab */}
        {activeTab === 'analytics' && <AnalyticsDashboard />}

        {/* Inventory + Categories tabs */}
        {activeTab !== 'analytics' && (
          <>
            {activeTab === 'inventory' && !showForm && (
              <div className="mb-8 space-y-4">
                {/* Search + Add row */}
                <div className="flex gap-3 flex-col sm:flex-row">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone pointer-events-none">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by title, brand, or ID…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 border-[2px] border-jet bg-surface outline-none font-medium focus:bg-[#A8B5A1]/10 transition-colors"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-jet font-bold text-lg leading-none" title="Clear search">✕</button>
                    )}
                  </div>
                  <button
                    onClick={openAddForm}
                    className="font-bold border-[2px] border-jet px-6 py-3 hover:bg-jet hover:text-surface transition-colors bg-jet text-surface shadow-[4px_4px_0px_theme(colors.jet)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none uppercase tracking-widest text-sm whitespace-nowrap shrink-0"
                  >
                    ＋ Add Item
                  </button>
                </div>

                {/* Status filter chips */}
                <div className="flex gap-2 flex-wrap">
                  {filterChips.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setStatusFilter(chip.key)}
                      className={`flex items-center gap-2 border-[2px] border-jet px-3 py-1.5 font-bold uppercase tracking-wider text-xs transition-colors ${
                        statusFilter === chip.key ? 'bg-jet text-surface' : 'bg-surface text-jet hover:bg-oatmeal'
                      }`}
                    >
                      {chip.label}
                      <span className={`tabular-nums px-1.5 py-0.5 text-[10px] ${statusFilter === chip.key ? 'bg-surface/20' : 'bg-jet/10'}`}>{chip.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Add / Edit Form ── */}
            {showForm && activeTab === 'inventory' && (
              <form onSubmit={handleSaveItem} className="bg-surface border-[3px] border-jet p-6 mb-10 shadow-[6px_6px_0px_theme(colors.jet)] space-y-4">
                <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest border-b-[2px] border-jet pb-2">
                  {editingId ? 'Edit Item' : 'Add New Item'}
                </h2>

                {/* Camera + AI section */}
                <div className="border-[2px] border-jet p-4 bg-oatmeal space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone">Photos</p>

                  {/* Camera buttons */}
                  <div className="flex gap-3 flex-wrap">
                    <label className="flex-1 min-w-[120px] flex items-center justify-center gap-2 border-[2px] border-jet bg-jet text-surface font-bold py-3 px-4 cursor-pointer hover:bg-stone transition-colors text-sm uppercase tracking-wide">
                      📷 Camera
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => addImages(e.target.files)} />
                    </label>
                    <label className="flex-1 min-w-[120px] flex items-center justify-center gap-2 border-[2px] border-jet bg-surface text-jet font-bold py-3 px-4 cursor-pointer hover:bg-oatmeal transition-colors text-sm uppercase tracking-wide">
                      🖼 Gallery
                      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addImages(e.target.files)} />
                    </label>
                    <button
                      type="button"
                      onClick={openDrivePicker}
                      className="flex-1 min-w-[120px] flex items-center justify-center gap-2 border-[2px] border-jet bg-surface text-jet font-bold py-3 px-4 cursor-pointer hover:bg-oatmeal transition-colors text-sm uppercase tracking-wide"
                    >
                      ☁️ Drive
                    </button>
                    {imageFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAIAnalysis}
                        disabled={isAnalyzing}
                        className={`flex-1 min-w-[120px] border-[2px] border-jet font-bold py-3 px-4 text-sm uppercase tracking-wide transition-colors ${
                          isAnalyzing
                            ? 'bg-stone/20 text-stone cursor-not-allowed'
                            : 'bg-[#A8B5A1] text-jet hover:bg-[#8fa88a]'
                        }`}
                      >
                        {isAnalyzing ? '⏳ Analyzing…' : '🤖 AI Fill'}
                      </button>
                    )}
                  </div>

                  {/* Image previews */}
                  {(imageFiles.length > 0 || driveImports.length > 0 || (formData.images && formData.images.length > 0)) && (
                    <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
                      {editingId && formData.images?.map((url, idx) => (
                        <div key={`ex-${idx}`} className={`w-20 h-20 shrink-0 border-[2px] overflow-hidden relative group ${idx === 0 ? 'border-[#16A34A]' : 'border-jet'}`}>
                          <div className={`absolute top-0 left-0 text-white text-[9px] px-1 font-bold z-10 ${idx === 0 ? 'bg-[#16A34A]' : 'bg-jet'}`}>{idx === 0 ? '★ COVER' : idx + 1}</div>
                          <img src={url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                            {idx !== 0 && <button type="button" onClick={() => handleMakeCoverExisting(idx)} className="text-[9px] font-bold text-white bg-jet px-2 py-0.5 w-[80%] uppercase">Set Cover</button>}
                            <button type="button" onClick={() => setFormData({ ...formData, images: formData.images?.filter((_, i) => i !== idx) })} className="text-[9px] font-bold text-white bg-red-600 px-2 py-0.5 w-[80%] uppercase">Remove</button>
                          </div>
                        </div>
                      ))}
                      {imageFiles.map((file, idx) => (
                        <div key={`new-${idx}`} className="w-20 h-20 shrink-0 border-[2px] border-stone overflow-hidden relative group opacity-90">
                          <div className="absolute top-0 left-0 bg-stone text-white text-[9px] px-1 font-bold z-10">NEW</div>
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                            {!editingId && idx !== 0 && <button type="button" onClick={() => handleMakeCoverNewFile(idx)} className="text-[9px] font-bold text-white bg-jet px-2 py-0.5 w-[80%] uppercase">Cover</button>}
                            <button type="button" onClick={() => setImageFiles(imageFiles.filter((_, i) => i !== idx))} className="text-[9px] font-bold text-white bg-red-600 px-2 py-0.5 w-[80%] uppercase">Remove</button>
                          </div>
                        </div>
                      ))}
                      {driveImports.map((file) => (
                        <div key={`imp-${file.id}`} className="w-20 h-20 shrink-0 border-[2px] border-[#1D6B5E] overflow-hidden relative group opacity-90">
                          <div className="absolute top-0 left-0 bg-[#1D6B5E] text-white text-[9px] px-1 font-bold z-10">DRIVE</div>
                          <img src={driveThumbUrl(file.id, 400)} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                            <button type="button" onClick={() => setDriveImports(driveImports.filter(f => f.id !== file.id))} className="text-[9px] font-bold text-white bg-red-600 px-2 py-0.5 w-[80%] uppercase">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {driveImports.length > 0 && (
                    <p className="text-[10px] text-[#1D6B5E] font-bold leading-snug">
                      {driveImports.length} Drive photo{driveImports.length > 1 ? 's' : ''} will be imported into this item when you save.
                    </p>
                  )}

                  {editingId && (formData.images?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-stone leading-snug">
                      ★ The green image is the cover (default thumbnail). Hover/tap any other photo to “Set Cover” or “Remove” it. Photo changes are saved to Drive when you press Save.
                    </p>
                  )}
                </div>

                {/* The basics */}
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone border-b-[2px] border-border-subtle pb-2">The Basics</p>
                  <Field label="Title" required>
                    <input type="text" placeholder="e.g. Solid Oak Dining Table" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={`${INPUT_CLS} font-bold`} />
                  </Field>
                  <Field label="Description" required hint="A warm, honest description — condition, why you're selling, key features.">
                    <textarea placeholder="Tell buyers about this item…" required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className={`${INPUT_CLS} font-medium text-base leading-relaxed resize-none`} />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Category" required>
                      <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className={`${INPUT_CLS} cursor-pointer`}>
                        {categories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Condition" required>
                      <input type="text" placeholder="e.g. Like New, Good, Fair" required value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })} className={INPUT_CLS} />
                    </Field>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone border-b-[2px] border-border-subtle pb-2">Pricing</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Sale Price (₪)" required>
                      <input type="number" inputMode="numeric" placeholder="0" required value={formData.price || ''} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className={`${INPUT_CLS} font-bold`} />
                    </Field>
                    <Field label="Original Price (₪)" hint="Optional — shown as a strikethrough to highlight the discount.">
                      <input type="number" inputMode="numeric" placeholder="0" value={formData.originalPrice || ''} onChange={e => setFormData({ ...formData, originalPrice: Number(e.target.value) || undefined })} className={INPUT_CLS} />
                    </Field>
                  </div>
                </div>

                {/* Details & logistics */}
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone border-b-[2px] border-border-subtle pb-2">Details &amp; Logistics</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Brand / Manufacturer">
                      <input type="text" placeholder="e.g. IKEA, Samsung" value={formData.brand || ''} onChange={e => setFormData({ ...formData, brand: e.target.value })} className={INPUT_CLS} />
                    </Field>
                    <Field label="Model">
                      <input type="text" placeholder="e.g. KALLAX, Galaxy S21" value={formData.model || ''} onChange={e => setFormData({ ...formData, model: e.target.value })} className={INPUT_CLS} />
                    </Field>
                    <Field label="Dimensions">
                      <input type="text" placeholder="e.g. 120 × 80 × 75 cm" value={formData.dimensions || ''} onChange={e => setFormData({ ...formData, dimensions: e.target.value })} className={INPUT_CLS} />
                    </Field>
                    <Field label="Delivery">
                      <select value={formData.delivery_time || 'flexible'} onChange={e => setFormData({ ...formData, delivery_time: e.target.value as 'flexible' | 'departure' })} className={`${INPUT_CLS} cursor-pointer`}>
                        <option value="flexible">Flexible</option>
                        <option value="departure">Near Departure (July)</option>
                      </select>
                    </Field>
                    <Field label="Contact / WhatsApp">
                      <select value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value as ItemContact })} className={`${INPUT_CLS} cursor-pointer`}>
                        <option value="hadas">Hadas's WhatsApp</option>
                        <option value="evya">Evya's WhatsApp</option>
                      </select>
                    </Field>
                  </div>
                </div>

                {/* Sticky action bar */}
                <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 px-6 py-4 bg-surface border-t-[2px] border-jet flex gap-3 z-10">
                  <button type="button" onClick={() => { setShowForm(false); setImageFiles([]); setDriveImports([]); }} className="font-bold border-[2px] border-jet px-5 py-3 hover:bg-oatmeal transition-colors uppercase tracking-widest text-sm shrink-0">Cancel</button>
                  <button disabled={isUploading || !googleToken} type="submit" className={`flex-1 text-surface font-bold py-3 border-[2px] border-jet transition-colors uppercase tracking-widest text-sm ${
                    isUploading || !googleToken ? 'bg-stone cursor-not-allowed' : 'bg-jet hover:bg-[#A8B5A1] hover:text-jet'
                  }`}>
                    {!googleToken ? 'Connect Google first' : isUploading ? 'Saving…' : editingId ? '✓ Save Changes' : '✓ Publish Item'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Inventory list ── */}
            {loading ? (
              <div className="animate-pulse text-xl block border-[3px] border-jet p-6 bg-surface">Loading Inventory…</div>
            ) : activeTab === 'inventory' ? (
              visibleItems.length === 0 ? (
                <div className="border-[3px] border-dashed border-stone/50 p-10 bg-surface text-center">
                  <p className="font-bold text-xl text-jet">{isFiltering ? 'No items match your filters.' : 'No items yet.'}</p>
                  <p className="text-stone mt-2 text-sm">
                    {isFiltering
                      ? 'Try a different search term or status.'
                      : 'Tap “Add Item” to publish your first listing.'}
                  </p>
                  {isFiltering && (
                    <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="mt-4 font-bold border-[2px] border-jet px-5 py-2 hover:bg-jet hover:text-surface transition-colors uppercase tracking-widest text-xs">Clear filters</button>
                  )}
                </div>
              ) : isFiltering ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone">
                    Showing {visibleItems.length} of {items.length} · reordering is disabled while filtering
                  </p>
                  {visibleItems.map(item => (
                    <StaticItem key={item.id} item={item} reservation={reservations.get(item.id)} {...rowHandlers} />
                  ))}
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Available section — draggable to reorder */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-jet">For Sale</h2>
                      <span className="text-[10px] font-bold bg-[#1D6B5E]/10 text-[#1D6B5E] border border-[#1D6B5E] px-2 py-0.5 tabular-nums">{activeItems.length}</span>
                      <span className="text-[10px] text-stone">· drag to reorder</span>
                    </div>
                    {activeItems.length === 0 ? (
                      <div className="border-[2px] border-dashed border-stone/40 p-6 bg-surface text-center text-stone text-sm font-bold">All items are sold. 🎉</div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-4">
                            {activeItems.map(item => (
                              <SortableItem key={item.id} item={item} reservation={reservations.get(item.id)} {...rowHandlers} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>

                  {/* Sold section — fixed order, newest sold first */}
                  {soldItems.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 border-t-[3px] border-jet pt-6">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-stone">Sold</h2>
                        <span className="text-[10px] font-bold bg-stone/15 text-stone border border-stone px-2 py-0.5 tabular-nums">{soldItems.length}</span>
                        <span className="text-[10px] text-stone">· newest first</span>
                      </div>
                      <div className="space-y-4 opacity-90">
                        {soldItems.map(item => (
                          <StaticItem key={item.id} item={item} reservation={reservations.get(item.id)} {...rowHandlers} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              /* ── Categories tab ── */
              <div className="space-y-8 max-w-2xl">
                <form onSubmit={handleCreateCategory} className="flex gap-4">
                  <input type="text" placeholder="New Category Name" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1 p-3 border-[2px] border-jet font-bold outline-none" />
                  <button type="submit" className="border-[2px] border-jet bg-jet text-surface font-bold uppercase tracking-widest px-6 hover:bg-stone transition-colors">Add</button>
                </form>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={categories.map(c => c.name)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {categories.map(cat => (
                        <SortableCategoryRow key={cat.name} category={cat} onDelete={handleDeleteCategory} onEditName={handleEditCategoryName} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* ── Drive Image Picker Modal ── */}
    {showDrivePicker && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jet/70" onClick={e => { if (e.target === e.currentTarget) setShowDrivePicker(false); }}>
        <div className="bg-surface border-[3px] border-jet shadow-[8px_8px_0px_theme(colors.jet)] w-full max-w-3xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b-[2px] border-jet px-6 py-4 shrink-0">
            <div>
              <h3 className="font-bold text-xl uppercase tracking-widest">Browse Drive</h3>
              <p className="text-xs text-stone mt-0.5">{selectedDriveIds.size > 0 ? `${selectedDriveIds.size} selected` : 'Click images to select'}</p>
            </div>
            <button type="button" onClick={() => setShowDrivePicker(false)} className="text-2xl font-bold hover:text-stone transition-colors leading-none">✕</button>
          </div>

          {/* Grid */}
          <div className="overflow-y-auto flex-1 p-4">
            {drivePickerLoading ? (
              <div className="flex items-center justify-center h-48 text-stone font-bold uppercase tracking-widest">Loading Drive files…</div>
            ) : pickableFiles.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-stone font-bold uppercase tracking-widest">No photos available in Drive folder</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {pickableFiles.map(file => {
                  const selected = selectedDriveIds.has(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => toggleDriveFile(file.id)}
                      className={`relative aspect-square border-[2px] overflow-hidden transition-all ${selected ? 'border-[#16A34A] scale-95 shadow-[0_0_0_3px_#16A34A]' : 'border-jet hover:border-stone'}`}
                    >
                      <img
                        src={driveThumbUrl(file.id, 400)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {selected && (
                        <div className="absolute inset-0 bg-[#16A34A]/20 flex items-center justify-center">
                          <span className="w-7 h-7 rounded-full bg-[#16A34A] text-white flex items-center justify-center font-bold text-base">✓</span>
                        </div>
                      )}
                      <p className="absolute bottom-0 left-0 right-0 bg-jet/70 text-white text-[9px] px-1 py-0.5 truncate">{file.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t-[2px] border-jet px-6 py-4 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={() => setShowDrivePicker(false)} className="border-[2px] border-jet font-bold px-6 py-2.5 hover:bg-oatmeal transition-colors uppercase tracking-wide text-sm">Cancel</button>
            <button
              type="button"
              onClick={confirmDriveSelection}
              disabled={selectedDriveIds.size === 0}
              className="border-[2px] border-jet bg-jet text-surface font-bold px-6 py-2.5 hover:bg-stone transition-colors uppercase tracking-wide text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add {selectedDriveIds.size > 0 ? `${selectedDriveIds.size} image${selectedDriveIds.size > 1 ? 's' : ''}` : 'Selected'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Reservation Modal ── */}
    {reservingItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jet/70" onClick={e => { if (e.target === e.currentTarget && !savingReservation) setReservingItem(null); }}>
        <form
          dir="rtl"
          onSubmit={handleSaveReservation}
          className="bg-surface border-[3px] border-jet shadow-[8px_8px_0px_theme(colors.jet)] w-full max-w-lg max-h-[90vh] flex flex-col text-right"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b-[2px] border-jet px-6 py-4 shrink-0">
            <div className="min-w-0">
              <h3 className="font-bold text-xl tracking-wide">שמירת מוצר לקונה</h3>
              <p className="text-xs text-stone mt-0.5 truncate">{reservingItem.title} · #{reservingItem.id}</p>
            </div>
            <button type="button" onClick={() => setReservingItem(null)} className="text-2xl font-bold hover:text-stone transition-colors leading-none shrink-0">✕</button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-6 space-y-4">
            <p className="text-[11px] text-stone leading-snug bg-oatmeal border-[2px] border-border-subtle p-2.5">
              🔒 פרטי הקונה נשמרים באופן פרטי ומאובטח, ולעולם לא מוצגים בחנות הפומבית. שמירת מוצר תסמן אותו כ״נמכר״.
            </p>

            <label className="block">
              <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 flex items-center gap-1">שם מלא של הקונה <span className="text-red-600">*</span></span>
              <input type="text" required value={resForm.buyer_name} onChange={e => setResForm({ ...resForm, buyer_name: e.target.value })} placeholder="לדוגמה: יעל כהן" className={`${INPUT_CLS} font-bold text-right`} />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">מחיר סגירה מוסכם (₪)</span>
                <input type="number" inputMode="numeric" min="0" value={resForm.sale_price} onChange={e => setResForm({ ...resForm, sale_price: e.target.value })} placeholder="לדוגמה: 400" className={`${INPUT_CLS} font-bold text-right`} />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">מקדמה שהתקבלה (₪)</span>
                <input type="number" inputMode="numeric" min="0" value={resForm.amount} onChange={e => setResForm({ ...resForm, amount: e.target.value })} placeholder="לדוגמה: 100" className={`${INPUT_CLS} font-bold text-right`} />
              </label>
            </div>

            {/* Live remaining balance */}
            {(() => {
              const balance = reservationBalance({
                sale_price: resForm.sale_price.trim() === '' ? null : Number(resForm.sale_price),
                amount: resForm.amount.trim() === '' ? null : Number(resForm.amount),
              });
              if (balance == null) return null;
              return (
                <div className="flex items-center justify-between border-[2px] border-jet bg-oatmeal px-4 py-3">
                  <span className="text-[11px] font-bold tracking-widest text-stone">יתרה לתשלום באיסוף</span>
                  <span className="text-xl font-bold text-jet">₪{balance}</span>
                </div>
              );
            })()}

            <label className="block">
              <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">תאריך איסוף</span>
              <input type="date" value={resForm.pickup_date} onChange={e => setResForm({ ...resForm, pickup_date: e.target.value })} className={`${INPUT_CLS} text-right`} />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">טלפון (וואטסאפ)</span>
              <input type="tel" inputMode="tel" dir="ltr" value={resForm.buyer_phone} onChange={e => setResForm({ ...resForm, buyer_phone: e.target.value })} placeholder="050-000-0000" className={`${INPUT_CLS} font-mono text-left`} />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">פרופיל פייסבוק (קישור או שם)</span>
              <input type="text" dir="ltr" value={resForm.buyer_facebook} onChange={e => setResForm({ ...resForm, buyer_facebook: e.target.value })} placeholder="https://facebook.com/…" className={`${INPUT_CLS} text-left`} />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold tracking-widest text-stone mb-1.5 block">הערות</span>
              <textarea rows={2} value={resForm.notes} onChange={e => setResForm({ ...resForm, notes: e.target.value })} placeholder="פרטים נוספים, סיכומים…" className={`${INPUT_CLS} resize-none text-right`} />
            </label>

            {resForm.buyer_facebook.trim() && /^https?:\/\//i.test(resForm.buyer_facebook.trim()) && (
              <a href={resForm.buyer_facebook.trim()} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#1877F2] underline inline-block">פתח פרופיל פייסבוק ↗</a>
            )}
          </div>

          {/* Footer */}
          <div className="border-t-[2px] border-jet px-6 py-4 flex gap-3 shrink-0 flex-wrap">
            <button type="submit" disabled={savingReservation} className={`flex-1 min-w-[140px] text-surface font-bold py-3 border-[2px] border-jet transition-colors tracking-widest text-sm ${savingReservation ? 'bg-stone cursor-not-allowed' : 'bg-[#7C3AED] hover:opacity-90'}`}>
              {savingReservation ? 'שומר…' : reservations.has(reservingItem.id) ? '✓ עדכן שמירה' : '★ שמור וסמן כנמכר'}
            </button>
            {reservations.has(reservingItem.id) && (
              <button type="button" onClick={handleCancelReservation} disabled={savingReservation} className="font-bold border-[2px] border-red-600 text-red-600 px-4 py-3 hover:bg-red-600 hover:text-white transition-colors tracking-wide text-sm">בטל שמירה</button>
            )}
            <button type="button" onClick={() => setReservingItem(null)} disabled={savingReservation} className="font-bold border-[2px] border-jet px-4 py-3 hover:bg-oatmeal transition-colors tracking-wide text-sm">סגור</button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}
