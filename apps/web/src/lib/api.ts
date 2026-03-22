export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export async function apiRequest<T>(
  path: string,
  input?: {
    method?: string;
    token?: string;
    body?: FormData | Record<string, unknown>;
  }
) {
  const isFormData = typeof FormData !== 'undefined' && input?.body instanceof FormData;
  const requestBody = input?.body
    ? ((isFormData ? input.body : JSON.stringify(input.body)) as BodyInit)
    : undefined;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: input?.method ?? 'GET',
    headers: {
      ...(input?.token ? { Authorization: `Bearer ${input.token}` } : {}),
      ...(input?.body && !isFormData ? { 'Content-Type': 'application/json' } : {})
    },
    body: requestBody,
    cache: 'no-store'
  });

  const text = await response.text();
  let data = {} as T & { message?: string };

  if (text) {
    try {
      data = JSON.parse(text) as T & { message?: string };
    } catch {
      throw new Error(text || 'Respuesta invalida del servidor');
    }
  }

  if (!response.ok) {
    throw new Error((data as { message?: string }).message ?? 'Error de solicitud');
  }

  return data;
}
