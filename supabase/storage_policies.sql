-- Allow authenticated users to upload images to the bucket
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'images' );

-- Allow authenticated users to update their uploads
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
CREATE POLICY "Allow authenticated updates" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( bucket_id = 'images' );

-- Allow authenticated users to delete items
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
CREATE POLICY "Allow authenticated deletes" 
ON storage.objects FOR DELETE 
TO authenticated 
USING ( bucket_id = 'images' );
