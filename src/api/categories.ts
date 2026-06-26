/**
 * @file categories.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { supabase } from '../lib/supabase';

export interface ItemCategory {
  name: string;
  display_order: number;
}

export async function fetchCategories(): Promise<ItemCategory[]> {
  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  return data as ItemCategory[];
}

export async function createCategory(name: string, display_order: number): Promise<boolean> {
  const { error } = await supabase
    .from('item_categories')
    .insert([{ name, display_order }]);
  
  if (error) {
    console.error('Error creating category:', error);
    return false;
  }
  return true;
}

export async function updateCategoryName(oldName: string, newName: string): Promise<boolean> {
  const { error } = await supabase
    .from('item_categories')
    .update({ name: newName })
    .eq('name', oldName);
  
  if (error) {
    console.error('Error updating category name:', error);
    return false;
  }
  return true;
}

export async function deleteCategory(name: string): Promise<boolean> {
  const { error } = await supabase
    .from('item_categories')
    .delete()
    .eq('name', name);
  
  if (error) {
    console.error('Error deleting category:', error);
    return false;
  }
  return true;
}

export async function reorderCategories(categories: ItemCategory[]): Promise<boolean> {
  const { error } = await supabase
    .from('item_categories')
    .upsert(categories);
  
  if (error) {
    console.error('Error reordering categories:', error);
    return false;
  }
  return true;
}
