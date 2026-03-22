async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada'));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToJpegFile(dataUrl: string, originalName: string) {
  return new Promise<File>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No fue posible preparar la conversion de la imagen'));
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No fue posible convertir la imagen a JPG'));
            return;
          }

          const safeName = originalName.replace(/\.[^.]+$/, '') || 'boleta';
          resolve(new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.92
      );
    };
    image.onerror = () => reject(new Error('La imagen seleccionada no pudo convertirse'));
    image.src = dataUrl;
  });
}

export async function normalizeReceiptFile(file: File) {
  if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'application/pdf') {
    return file;
  }

  if (file.type.startsWith('image/')) {
    const dataUrl = await fileToDataUrl(file);
    return dataUrlToJpegFile(dataUrl, file.name);
  }

  throw new Error('El archivo debe ser una imagen o un PDF');
}
