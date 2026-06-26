import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchItems, updateItemStatus, updateItemContact, invalidateDriveCache } from '../api/items';
import { fetchCategories, createCategory, updateCategoryName, deleteCategory, reorderCategories } from '../api/categories';
import type { ItemCategory } from '../api/categories';
import type { YardSaleItem, ItemStatus, ItemContact } from '../types';
import AnalyticsDashboard from './AnalyticsDashboard';
import { useGoogleOAuth } from '../hooks/useGoogleOAuth';
import { uploadToDrive, driveFilename, listDriveFiles, driveThumbUrl } from '../api/drive-admin';
import type { DriveFile } from '../api/drive-admin';
import {
  readAllRows, parseHeaders, findRow,
  getNextItemId, appendRow, updateRow,
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
  };
}

// ── SortableItem ──────────────────────────────────────────────────────────────

function SortableItem({ item, onDelete, onEdit, onHide, onStatusChange, onContactChange }: {
  item: YardSaleItem;
  onDelete: (item: YardSaleItem) => void;
  onEdit: (item: YardSaleItem) => void;
  onHide: (item: YardSaleItem) => void;
  onStatusChange: (id: string, s: ItemStatus) => void;
  onContactChange: (id: string, c: ItemContact) => void;
}) {
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
      className={`bg-surface border-[3px] border-jet p-4 sm:p-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shadow-[4px_4px_0px_theme(colors.jet)] ${isDragging ? 'shadow-none' : ''} ${item.hidden ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div
          {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-2 hover:bg-oatmeal border-[2px] border-transparent hover:border-jet transition-colors text-stone hover:text-jet"
          title="Drag to reorder"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <div className="w-16 h-16 shrink-0 border-[2px] border-jet bg-white overflow-hidden">
          {item.images?.[0] && <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-lg leading-tight">{item.title}</h3>
            {item.hidden && <span className="text-[10px] font-bold bg-stone/20 text-stone px-2 py-0.5 uppercase tracking-wider">Hidden</span>}
          </div>
          <p className="font-mono text-stone text-sm">₪{item.price} · ID {item.id}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-4 sm:mt-0 justify-end">
        <button onClick={() => onDelete(item)} className="border-[2px] border-red-600 text-red-600 bg-transparent p-2 font-bold hover:bg-red-600 hover:text-white transition-colors px-4">Delete</button>
        <button onClick={() => onHide(item)} className="border-[2px] border-stone text-stone bg-transparent p-2 font-bold hover:bg-stone hover:text-surface transition-colors px-3">{item.hidden ? 'Show' : 'Hide'}</button>
        <button onClick={() => onEdit(item)} className="border-[2px] border-jet bg-transparent p-2 font-bold hover:bg-jet hover:text-surface transition-colors px-4">Edit</button>
        <select value={item.status} onChange={e => onStatusChange(item.id, e.target.value as ItemStatus)} className="flex-1 sm:flex-none border-[2px] border-jet bg-transparent p-2 font-bold cursor-pointer outline-none hover:bg-jet hover:text-surface transition-colors">
          <option value="available">Available</option>
          <option value="pending">Pending</option>
          <option value="sold">Sold</option>
        </select>
        <select value={item.contact} onChange={e => onContactChange(item.id, e.target.value as ItemContact)} className="flex-1 sm:flex-none border-[2px] border-jet bg-transparent p-2 font-bold cursor-pointer outline-none hover:bg-jet hover:text-surface transition-colors">
          <option value="evya">Evya's WhatsApp</option>
          <option value="hadas">Hadas's WhatsApp</option>
        </select>
      </div>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

const EMPTY_FORM: Partial<YardSaleItem> = {
  title: '', description: '', price: 0, condition: '', category: '',
  status: 'available', images: [], dimensions: '', contact: 'hadas',
  delivery_time: 'flexible', originalPrice: undefined, brand: '', model: '',
};

export default function AdminDashboard() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [items, setItems] = useState<YardSaleItem[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inventory' | 'analytics' | 'categories'>('inventory');
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
    const [data, cats] = await Promise.all([fetchItems(), fetchCategories()]);
    setItems(data);
    setCategories(cats);
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
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!geminiKey) { alert('Add VITE_GEMINI_API_KEY to .env.local to enable AI analysis.'); return; }
    if (imageFiles.length === 0) { alert('Take or select at least one photo first.'); return; }

    setIsAnalyzing(true);
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const imageParts = await Promise.all(
        imageFiles.slice(0, 3).map(async f => ({
          inlineData: { data: await fileToBase64(f), mimeType: f.type },
        }))
      );

      const result = await model.generateContent([
        ...imageParts,
        `Analyze these product photos for a yard sale listing. Return ONLY a JSON object (no markdown) with:
{
  "title": "concise product title in English (max 60 chars)",
  "description": "warm 2-3 sentence description mentioning condition and key features",
  "condition": "one of exactly: excellent, like_new, good, fair, used",
  "category": "one of exactly: furniture, appliance, other",
  "brand": "brand or manufacturer name if visible, else empty string",
  "model": "model name or number if visible, else empty string",
  "originalPrice": estimated original retail price as integer (0 if unknown)
}`,
      ]);

      const text = result.response.text().trim();
      let parsed: any;
      try { parsed = JSON.parse(text); }
      catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }

      if (parsed) {
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
      } else {
        alert('AI could not parse the image. Please fill the form manually.');
      }
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
    if (driveFiles.length === 0) {
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
    }
  };

  const confirmDriveSelection = () => {
    const urls = driveFiles
      .filter(f => selectedDriveIds.has(f.id))
      .map(f => driveThumbUrl(f.id, 2000));
    setFormData(prev => ({ ...prev, images: [...(prev.images ?? []), ...urls] }));
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

      // 2. Upload new images to Drive with naming convention
      const newDriveUrls: string[] = [];
      if (imageFiles.length > 0) {
        // Existing drive images count as offset for suffix index
        const existingDriveCount = editingId
          ? (formData.images?.filter(u => u.includes('drive.google.com')).length ?? 0)
          : 0;
        for (let i = 0; i < imageFiles.length; i++) {
          const filename = driveFilename(itemId, existingDriveCount + i, imageFiles[i]);
          const url = await uploadToDrive(googleToken, imageFiles[i], filename);
          if (url) newDriveUrls.push(url);
        }
        invalidateDriveCache(); // public storefront will pick up new images on next load
      }

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
      const { headers } = parseHeaders(allRows);

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

      // 5. Update local state
      const allImages = [
        ...(formData.images?.filter(u => !u.includes('drive.google.com')) ?? []),
        ...newDriveUrls,
      ];

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
          images: newDriveUrls,
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
    } catch (err) {
      console.error('Save failed:', err);
      alert('An error occurred. Check the console for details.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ItemStatus) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    // Sync to Sheets
    if (googleToken) {
      try {
        const allRows = await getSheetRows();
        const { headers } = parseHeaders(allRows);
        const rowIdx = findRow(allRows, id);
        if (rowIdx !== -1) {
          await updateRow(googleToken, rowIdx, headers, allRows[rowIdx], { status: newStatus });
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
      const oldIndex = items.findIndex(i => i.id === active.id);
      const newIndex = items.findIndex(i => i.id === over.id);
      const ordered = arrayMove(items, oldIndex, newIndex).map((item, idx, arr) => ({
        ...item,
        display_order: arr.length - idx,
      }));
      setItems(ordered);

      if (googleToken) {
        try {
          const allRows = await getSheetRows();
          const { headers } = parseHeaders(allRows);
          for (const item of ordered) {
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
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditForm = (item: YardSaleItem) => {
    setEditingId(item.id);
    setFormData({ ...item });
    setImageFiles([]);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMakeCoverExisting = (idx: number) => {
    if (!formData.images) return;
    const imgs = [...formData.images];
    const [t] = imgs.splice(idx, 1);
    setFormData({ ...formData, images: [t, ...imgs] });
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

  return (
    <>
    <div className="min-h-screen bg-oatmeal py-10 px-4 sm:px-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-end mb-6 border-b-[3px] border-jet pb-4 flex-wrap gap-4">
          <h1 className="text-4xl font-bold text-jet uppercase tracking-widest">Store Dashboard</h1>
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
            {activeTab === 'inventory' && (
              <div className="flex justify-start mb-8">
                <button
                  onClick={showForm ? () => setShowForm(false) : openAddForm}
                  className="font-bold border-[2px] border-jet px-6 py-3 hover:bg-jet hover:text-surface transition-colors bg-surface shadow-[4px_4px_0px_theme(colors.jet)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none uppercase tracking-widest text-sm"
                >
                  {showForm ? '✕ Close Form' : '＋ Add New Item'}
                </button>
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
                  {(imageFiles.length > 0 || (formData.images && formData.images.length > 0)) && (
                    <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
                      {editingId && formData.images?.map((url, idx) => (
                        <div key={`ex-${idx}`} className="w-20 h-20 shrink-0 border-[2px] border-jet overflow-hidden relative group">
                          <div className="absolute top-0 left-0 bg-jet text-white text-[9px] px-1 font-bold z-10">{idx === 0 ? 'COVER' : idx + 1}</div>
                          <img src={url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                            {idx !== 0 && <button type="button" onClick={() => handleMakeCoverExisting(idx)} className="text-[9px] font-bold text-white bg-jet px-2 py-0.5 w-[80%] uppercase">Cover</button>}
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
                    </div>
                  )}
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" placeholder="Title *" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none font-bold" />
                  <input type="number" placeholder="Sale Price (₪) *" required value={formData.price || ''} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} className="w-full p-3 border-[2px] border-jet bg-white outline-none font-bold" />
                  <input type="number" placeholder="Original Price (₪) — optional, shows as strikethrough" value={formData.originalPrice || ''} onChange={e => setFormData({ ...formData, originalPrice: Number(e.target.value) || undefined })} className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                  <input type="text" placeholder="Brand / Manufacturer (e.g. IKEA, Samsung)" value={formData.brand || ''} onChange={e => setFormData({ ...formData, brand: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                  <input type="text" placeholder="Model name or number" value={formData.model || ''} onChange={e => setFormData({ ...formData, model: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                  <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    {categories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                  </select>
                  <input type="text" placeholder="Condition (e.g. Like New) *" required value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                  <select value={formData.delivery_time || 'flexible'} onChange={e => setFormData({ ...formData, delivery_time: e.target.value as 'flexible' | 'departure' })} className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    <option value="flexible">Delivery: Flexible</option>
                    <option value="departure">Delivery: Near Departure (July)</option>
                  </select>
                  <input type="text" placeholder="Dimensions (optional)" value={formData.dimensions || ''} onChange={e => setFormData({ ...formData, dimensions: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                  <select value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value as ItemContact })} className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    <option value="hadas">Hadas's WhatsApp</option>
                    <option value="evya">Evya's WhatsApp</option>
                  </select>
                </div>

                <textarea placeholder="Description *" required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 border-[2px] border-jet bg-white outline-none font-medium text-lg leading-relaxed resize-none" />

                <button disabled={isUploading || !googleToken} type="submit" className={`w-full text-surface font-bold py-4 mt-4 border-[2px] border-jet transition-colors uppercase tracking-widest ${
                  isUploading || !googleToken ? 'bg-stone cursor-not-allowed' : 'bg-jet hover:bg-[#A8B5A1] hover:text-jet'
                }`}>
                  {!googleToken ? 'Connect Google first' : isUploading ? 'Saving…' : editingId ? 'Save Changes' : 'Publish Item'}
                </button>
              </form>
            )}

            {/* ── Inventory list ── */}
            {loading ? (
              <div className="animate-pulse text-xl block border-[3px] border-jet p-6 bg-surface">Loading Inventory…</div>
            ) : activeTab === 'inventory' ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {items.map(item => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onDelete={handleDeleteItem}
                        onEdit={openEditForm}
                        onHide={handleHideItem}
                        onStatusChange={handleStatusChange}
                        onContactChange={handleContactChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
            ) : driveFiles.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-stone font-bold uppercase tracking-widest">No files found in Drive folder</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {driveFiles.map(file => {
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
    </>
  );
}
