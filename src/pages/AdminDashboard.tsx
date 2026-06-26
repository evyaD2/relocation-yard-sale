/**
 * @file AdminDashboard.tsx
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchItems, updateItemStatus, updateItemContact, createItem, updateItem, deleteItem, uploadImage, reorderItems } from '../api/items';
import { fetchCategories, createCategory, updateCategoryName, deleteCategory, reorderCategories } from '../api/categories';
import type { ItemCategory } from '../api/categories';
import type { YardSaleItem, ItemStatus, ItemContact } from '../types';
import AnalyticsDashboard from './AnalyticsDashboard';

// DND Kit Imports
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ item, onDelete, onEdit, onStatusChange, onContactChange }: {
  item: YardSaleItem;
  onDelete: (item: YardSaleItem) => void;
  onEdit: (item: YardSaleItem) => void;
  onStatusChange: (id: string, s: ItemStatus) => void;
  onContactChange: (id: string, c: ItemContact) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

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
      className={`bg-surface border-[3px] border-jet p-4 sm:p-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shadow-[4px_4px_0px_theme(colors.jet)] ${isDragging ? 'shadow-none' : ''}`}
    >
      <div className="flex items-center gap-4 flex-1">
        {/* Drag Handle Icon */}
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing p-2 hover:bg-oatmeal border-[2px] border-transparent hover:border-jet transition-colors text-stone hover:text-jet"
          title="Drag to reorder"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>

        <div className="w-16 h-16 shrink-0 border-[2px] border-jet bg-white overflow-hidden">
           {item.images?.[0] && <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />}
        </div>
        <div>
          <h3 className="font-bold text-lg leading-tight mb-1">{item.title}</h3>
          <p className="font-mono text-stone text-sm">₪{item.price}</p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-4 sm:mt-0 justify-end">
        <button 
          onClick={() => onDelete(item)}
          className="border-[2px] border-red-600 text-red-600 bg-transparent p-2 font-bold hover:bg-red-600 hover:text-white transition-colors px-4"
        >
          Delete
        </button>
        <button 
          onClick={() => onEdit(item)}
          className="border-[2px] border-jet bg-transparent p-2 font-bold hover:bg-jet hover:text-surface transition-colors px-4"
        >
          Edit
        </button>
        <select 
          value={item.status}
          onChange={(e) => onStatusChange(item.id, e.target.value as ItemStatus)}
          className="flex-1 sm:flex-none border-[2px] border-jet bg-transparent p-2 font-bold cursor-pointer outline-none hover:bg-jet hover:text-surface transition-colors"
        >
          <option value="available">Available</option>
          <option value="pending">Pending</option>
          <option value="sold">Sold</option>
        </select>

        <select 
          value={item.contact}
          onChange={(e) => onContactChange(item.id, e.target.value as ItemContact)}
          className="flex-1 sm:flex-none border-[2px] border-jet bg-transparent p-2 font-bold cursor-pointer outline-none hover:bg-jet hover:text-surface transition-colors"
        >
          <option value="dor">Dor's WhatsApp</option>
          <option value="neri">Neri's WhatsApp</option>
        </select>
      </div>
    </div>
  );
}

function SortableCategoryRow({ category, onDelete, onEditName }: {
  category: ItemCategory;
  onDelete: (name: string) => void;
  onEditName: (oldName: string, newName: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.name });
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(category.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    if (editVal.trim() && editVal !== category.name) {
      onEditName(category.name, editVal.trim());
    }
    setIsEditing(false);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`bg-surface border-[2px] border-jet p-4 flex gap-4 justify-between items-center shadow-[2px_2px_0px_theme(colors.jet)] ${isDragging ? 'shadow-none' : ''}`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-oatmeal text-stone hover:text-jet transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        {isEditing ? (
          <input 
            type="text" 
            autoFocus 
            value={editVal} 
            onChange={e => setEditVal(e.target.value)} 
            onBlur={handleSave} 
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="flex-1 border-[2px] border-jet px-2 py-1 outline-none font-bold" 
          />
        ) : (
          <span className="font-bold flex-1 text-lg">{category.name}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setIsEditing(!isEditing)} className="text-sm font-bold border-b-2 border-jet hover:text-stone transition-colors px-1">
          {isEditing ? 'Save' : 'Rename'}
        </button>
        <button onClick={() => onDelete(category.name)} className="text-sm font-bold text-red-600 border-b-2 border-red-600 hover:text-red-400 transition-colors px-1">
          Delete
        </button>
      </div>
    </div>
  );
}

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
  const [formData, setFormData] = useState<Partial<YardSaleItem>>({
    title: '', description: '', price: 0, condition: '', category: '', status: 'available', images: [], dimensions: '', contact: 'neri', delivery_time: 'flexible'
  });

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5, // Immediately drag after 5px movement on PC
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Require hold on mobile to distinguish from vertical scroll
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadItems();
    }
  }, [session]);

  const loadItems = async () => {
    setLoading(true);
    const [data, cats] = await Promise.all([fetchItems(), fetchCategories()]);
    setItems(data);
    setCategories(cats);
    if (!formData.category && cats.length > 0) {
      setFormData(prev => ({ ...prev, category: cats[0].name }));
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ItemStatus) => {
    const success = await updateItemStatus(id, newStatus);
    if (success) {
      setItems(items.map(item => item.id === id ? { ...item, status: newStatus } : item));
    } else {
      alert("Failed to update status");
    }
  };

  const handleContactChange = async (id: string, newContact: ItemContact) => {
    const success = await updateItemContact(id, newContact);
    if (success) {
      setItems(items.map(item => item.id === id ? { ...item, contact: newContact } : item));
    } else {
      alert("Failed to update contact");
    }
  };

  const handleDeleteItem = async (item: YardSaleItem) => {
    if (window.confirm(`Are you sure you want to permanently delete "${item.title}"?`)) {
      const success = await deleteItem(item);
      if (success) {
        setItems(items.filter(i => i.id !== item.id));
      } else {
        alert("Failed to delete item");
      }
    }
  };

  const handleMakeCoverExisting = (idx: number) => {
    if (!formData.images) return;
    const newImages = [...formData.images];
    const [target] = newImages.splice(idx, 1);
    newImages.unshift(target);
    setFormData({ ...formData, images: newImages });
  };
  
  const handleMakeCoverNewFile = (idx: number) => {
    const newFiles = [...imageFiles];
    const [target] = newFiles.splice(idx, 1);
    newFiles.unshift(target);
    setImageFiles(newFiles);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImageFiles(Array.from(e.target.files));
    }
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ title: '', description: '', price: 0, condition: '', category: categories[0]?.name || '', status: 'available', images: [], dimensions: '', contact: 'neri', delivery_time: 'flexible' });
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

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.price || !formData.category) {
      alert("Please fill out all required fields.");
      return;
    }
    
    setIsUploading(true);
    
    let uploadedUrls: string[] = formData.images || [];
    
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
          const url = await uploadImage(file);
          if (url) {
              uploadedUrls.push(url);
          } else {
              alert(`Failed to upload ${file.name}. Proceeding with others.`);
          }
      }
    }

    if (uploadedUrls.length === 0) {
        alert("Must have at least one image.");
        setIsUploading(false);
        return;
    }

    if (editingId) {
      // Update
      const success = await updateItem(editingId, {
        title: formData.title,
        description: formData.description,
        price: Number(formData.price),
        condition: formData.condition,
        category: formData.category,
        dimensions: formData.dimensions,
        contact: formData.contact,
        delivery_time: formData.delivery_time as 'flexible' | 'departure',
        images: uploadedUrls
      });
      
      if (success) {
        setItems(items.map(item => item.id === editingId ? { ...item, ...formData, images: uploadedUrls } as YardSaleItem : item));
        setShowForm(false);
      } else {
        alert("Failed to update item.");
      }
    } else {
      // Create
      const itemToCreate: Omit<YardSaleItem, 'id'> = {
        title: formData.title!,
        description: formData.description!,
        price: Number(formData.price),
        condition: formData.condition || 'Good',
        category: formData.category!,
        status: (formData.status as ItemStatus) || 'available',
        images: uploadedUrls,
        dimensions: formData.dimensions,
        contact: (formData.contact as ItemContact) || 'neri',
        delivery_time: (formData.delivery_time as 'flexible' | 'departure') || 'flexible'
      };

      const created = await createItem(itemToCreate);
      if (created) {
        setItems([created, ...items]);
        setShowForm(false);
      } else {
        alert("Failed to create item.");
      }
    }
    setIsUploading(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    if (activeTab === 'inventory') {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      
      // Optimistic update
      setItems(newItems);

      // Prepare bulk update data (including all fields to satisfy NOT NULL constraints)
      const updates = newItems.map((item, index) => ({
        ...item,
        display_order: newItems.length - index
      }));

      // Persist to database
      const success = await reorderItems(updates);
      if (!success) {
        alert("Failed to save new order. Reverting...");
        loadItems(); // Revert
      }
    } else if (activeTab === 'categories') {
      const oldIndex = categories.findIndex((c) => c.name === active.id);
      const newIndex = categories.findIndex((c) => c.name === over.id);

      const newCats = arrayMove(categories, oldIndex, newIndex);
      setCategories(newCats);

      const updates = newCats.map((cat, index) => ({
        ...cat,
        display_order: index + 1
      }));

      const success = await reorderCategories(updates);
      if (!success) {
        alert("Failed to save category order.");
        loadItems();
      }
    }
  };

  const [newCatName, setNewCatName] = useState('');
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const name = newCatName.trim();
    if (categories.find(c => c.name === name)) {
      alert("Category exists!");
      return;
    }
    const order = categories.length > 0 ? Math.max(...categories.map(c => c.display_order)) + 1 : 1;
    const success = await createCategory(name, order);
    if (success) {
      setCategories([...categories, { name, display_order: order }]);
      setNewCatName('');
    } else {
      alert("Failed to create category");
    }
  };

  const handleDeleteCategory = async (name: string) => {
    if (items.some(i => i.category === name)) {
      alert(`Cannot delete ${name} because it has items assigned to it. Assign them to another category first.`);
      return;
    }
    if (window.confirm(`Delete category ${name}?`)) {
      const success = await deleteCategory(name);
      if (success) {
        setCategories(categories.filter(c => c.name !== name));
      } else {
        alert("Delete failed");
      }
    }
  };

  const handleEditCategoryName = async (oldName: string, newName: string) => {
    if (categories.find(c => c.name === newName)) {
      alert("Category already exists!");
      return;
    }
    const success = await updateCategoryName(oldName, newName);
    if (success) {
      // update categories list
      setCategories(categories.map(c => c.name === oldName ? { ...c, name: newName } : c));
      // update loaded items optimistically
      setItems(items.map(i => i.category === oldName ? { ...i, category: newName } as YardSaleItem : i));
    } else {
      alert("Rename failed");
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-oatmeal flex px-4 items-center justify-center">
        <form onSubmit={handleLogin} className="max-w-md w-full bg-surface p-8 border-[3px] border-jet shadow-[6px_6px_0px_theme(colors.jet)]">
          <Link to="/" className="text-sm font-bold underline mb-8 block">&larr; Back to Store</Link>
          <h2 className="text-2xl font-bold bg-jet text-surface inline-block px-4 py-2 border-[2px] border-jet mb-8 uppercase tracking-widest">Admin Login</h2>
          <div className="space-y-4">
            <input 
              type="email" 
              placeholder="Email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 border-[2px] border-jet bg-surface font-mono outline-none focus:bg-[#A8B5A1]/20 transition-colors"
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 border-[2px] border-jet bg-surface font-mono outline-none focus:bg-[#A8B5A1]/20 transition-colors"
            />
            <button type="submit" className="w-full bg-jet text-surface font-bold py-4 mt-4 hover:bg-jet border-[2px] border-jet transition-colors uppercase tracking-widest">
              Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-oatmeal py-10 px-4 sm:px-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-end mb-6 border-b-[3px] border-jet pb-4 flex-wrap gap-4">
          <h1 className="text-4xl font-bold text-jet uppercase tracking-widest">Store Dashboard</h1>
          <div className="flex gap-4">
            <Link to="/" className="font-bold underline text-stone hover:text-jet self-center mr-4">
              View Storefront
            </Link>
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="font-bold underline text-stone hover:text-jet self-center ml-2"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex gap-0 mb-8 w-full overflow-x-auto border-[2px] border-jet">
          {(['inventory', 'categories', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setShowForm(false); }}
              className={`px-4 sm:px-6 py-2.5 font-bold uppercase tracking-widest text-xs sm:text-sm transition-colors whitespace-nowrap flex-1 text-center border-r-[2px] last:border-r-0 border-jet ${
                activeTab === tab
                  ? 'bg-jet text-surface'
                  : 'bg-surface text-jet hover:bg-oatmeal'
              }`}
            >
              {tab === 'inventory' ? '📦 Inventory' : tab === 'categories' ? '🗂 Categories' : '📊 Analytics'}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        {activeTab === 'analytics' ? (
          <AnalyticsDashboard />
        ) : (
          <>
            <div className="flex justify-start mb-8">
              <button 
                onClick={showForm ? () => setShowForm(false) : openAddForm} 
                className="font-bold border-[2px] border-jet px-6 py-3 hover:bg-jet hover:text-surface transition-colors bg-surface shadow-[4px_4px_0px_theme(colors.jet)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none uppercase tracking-widest text-sm"
              >
                {showForm ? '✕ Close Form' : '＋ Add New Item'}
              </button>
            </div>

            {showForm && (
              <form onSubmit={handleSaveItem} className="bg-surface border-[3px] border-jet p-6 mb-10 shadow-[6px_6px_0px_theme(colors.jet)] space-y-4">
                <h2 className="text-2xl font-bold mb-4 uppercase tracking-widest border-b-[2px] border-jet pb-2">
                  {editingId ? 'Edit Item' : 'Add New Item'}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" placeholder="Title" required
                    value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none font-bold" />
                  
                  <input type="number" placeholder="Price (₪)" required
                    value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none font-bold" />

                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    {categories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                  </select>

                  <input type="text" placeholder="Condition (e.g. Like New)" required
                    value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none" />

                  <select value={formData.delivery_time || 'flexible'} onChange={e => setFormData({...formData, delivery_time: e.target.value as 'flexible' | 'departure'})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    <option value="flexible">Take / Delivery: Flexible (גמיש)</option>
                    <option value="departure">Take / Delivery: Around Departure (סמוך לעזיבה)</option>
                  </select>

                  <input type="text" placeholder="Dimensions (Optional)"
                    value={formData.dimensions} onChange={e => setFormData({...formData, dimensions: e.target.value})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none" />
                    
                  <select value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value as ItemContact})}
                    className="w-full p-3 border-[2px] border-jet bg-white outline-none cursor-pointer">
                    <option value="dor">Dor's WhatsApp</option>
                    <option value="neri">Neri's WhatsApp</option>
                  </select>
                </div>

                <textarea placeholder="Description" required rows={4}
                  value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full p-3 border-[2px] border-jet bg-white outline-none font-medium text-lg leading-relaxed resize-none" />

                <div className="w-full p-4 border-[2px] border-jet bg-white border-dashed">
                  <label className="block text-sm font-bold uppercase tracking-widest text-stone mb-2 cursor-pointer">
                    Upload Images
                    <br/>
                    <span className="text-xs font-normal normal-case opacity-80 mt-1 block tracking-normal">
                      The first image you select will be the primary cover image. You can hold CTRL/CMD to select multiple, or select them one by one in the order you want.
                    </span>
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="mt-4 block w-full text-sm text-stone
                        file:mr-4 file:py-2 file:px-4
                        file:border-0 file:border-[2px] file:border-jet
                        file:text-sm file:font-bold file:uppercase file:tracking-widest
                        file:bg-surface file:text-jet
                        hover:file:bg-[#A8B5A1] cursor-pointer outline-none"
                    />
                  </label>
                  
                  {(imageFiles.length > 0 || (formData.images && formData.images.length > 0)) && (
                    <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
                      {/* Show existing images when editing */}
                      {editingId && formData.images?.map((url, idx) => (
                        <div key={`existing-${idx}`} className="w-24 h-24 shrink-0 border-[2px] border-jet shadow-[2px_2px_0px_theme(colors.jet)] overflow-hidden relative group">
                          <div className="absolute top-0 left-0 bg-jet text-white text-[10px] px-1 font-bold z-10">{idx === 0 ? 'COVER' : idx+1}</div>
                          <img src={url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                            {idx !== 0 && (
                              <button type="button" onClick={() => handleMakeCoverExisting(idx)} className="text-[10px] font-bold text-white bg-jet px-2 py-1 w-[80%] hover:scale-105 transition-transform uppercase">Make Cover</button>
                            )}
                            <button type="button" onClick={() => setFormData({...formData, images: formData.images?.filter((_, i) => i !== idx)})} className="text-[10px] font-bold text-white bg-red-600 px-2 py-1 w-[80%] hover:scale-105 transition-transform uppercase">Remove</button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Show new unsaved images */}
                      {imageFiles.map((file, idx) => (
                        <div key={`new-${idx}`} className="w-24 h-24 shrink-0 border-[2px] border-stone shadow-[2px_2px_0px_theme(colors.stone)] overflow-hidden relative group opacity-90">
                          <div className="absolute top-0 left-0 bg-stone text-white text-[10px] px-1 font-bold z-10">{(!editingId && idx === 0 && (!formData.images || formData.images.length===0)) ? 'COVER (NEW)' : 'NEW'}</div>
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
                               {(!editingId && idx !== 0) && (
                                <button type="button" onClick={() => handleMakeCoverNewFile(idx)} className="text-[10px] font-bold text-white bg-jet px-2 py-1 w-[80%] hover:scale-105 transition-transform uppercase">Make Cover</button>
                              )}
                              <button type="button" onClick={() => setImageFiles(imageFiles.filter((_, i) => i !== idx))} className="text-[10px] font-bold text-white bg-red-600 px-2 py-1 w-[80%] hover:scale-105 transition-transform uppercase">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button disabled={isUploading} type="submit" className={`w-full text-surface font-bold py-4 mt-4 border-[2px] border-jet transition-colors uppercase tracking-widest ${isUploading ? 'bg-stone cursor-not-allowed' : 'bg-jet hover:bg-[#A8B5A1] hover:text-jet'}`}>
                  {isUploading ? 'Saving...' : (editingId ? 'Save Changes' : 'Publish Item')}
                </button>
              </form>
            )}

            {loading ? (
              <div className="animate-pulse text-xl block border-[3px] border-jet p-6 bg-surface">Loading Inventory...</div>
            ) : activeTab === 'inventory' ? (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={items.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {items.map(item => (
                      <SortableItem 
                        key={item.id} 
                        item={item} 
                        onDelete={handleDeleteItem}
                        onEdit={openEditForm}
                        onStatusChange={handleStatusChange}
                        onContactChange={handleContactChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="space-y-8 max-w-2xl">
                <form onSubmit={handleCreateCategory} className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="New Category Name" 
                    value={newCatName} 
                    onChange={e => setNewCatName(e.target.value)} 
                    className="flex-1 p-3 border-[2px] border-jet font-bold outline-none"
                  />
                  <button type="submit" className="border-[2px] border-jet bg-jet text-surface font-bold uppercase tracking-widest px-6 hover:bg-stone transition-colors">
                    Add
                  </button>
                </form>
                
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={categories.map(c => c.name)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {categories.map(category => (
                        <SortableCategoryRow 
                          key={category.name} 
                          category={category} 
                          onDelete={handleDeleteCategory}
                          onEditName={handleEditCategoryName}
                        />
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
  );
}
