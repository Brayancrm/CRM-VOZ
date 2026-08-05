import {
  getTranscriptionApiSecret,
  getTranscriptionApiUrl,
  isTranscriptionConfigured,
} from '@/services/transcriptionConfig';

export async function isOpenAiProxyConfigured(): Promise<boolean> {
  return isTranscriptionConfigured();
}

export async function getOpenAiProxyBaseUrl(): Promise<string | null> {
  if (!(await isOpenAiProxyConfigured())) return null;
  const url = await getTranscriptionApiUrl();
  return url || null;
}

export async function openAiProxyAuthHeaders(): Promise<
  Record<string, string>
> {
  const secret = await getTranscriptionApiSecret();
  if (!secret) return {};
  return { Authorization: `Bearer ${secret}` };
}

/** Testa /health no Railway (Whisper + SeCretina). */
export async function probeOpenAiProxy(): Promise<{
  ok: boolean;
  message: string;
}> {
  const baseUrl = await getOpenAiProxyBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      message: 'URL do servidor não configurada.',
    };
  }

  try {
    const headers = await openAiProxyAuthHeaders();
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      secretina?: boolean;
      whisper?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || `Servidor retornou ${res.status}`,
      };
    }
    if (!data.ok) {
      return { ok: false, message: 'Servidor respondeu sem ok.' };
    }
    if (!data.secretina && !data.whisper) {
      return {
        ok: false,
        message:
          'Servidor online, mas OPENAI_API_KEY não está definida no Railway.',
      };
    }
    return {
      ok: true,
      message: 'Servidor OK — voz e interpretação via Railway.',
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Falha de rede ao testar.',
    };
  }
}
