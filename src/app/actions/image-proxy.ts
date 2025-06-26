
'use server';

export async function getImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${blob.type};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image on server:', error);
    // Return a placeholder or an empty string to indicate failure
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // transparent 1x1 pixel
  }
}
