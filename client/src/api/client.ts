export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
}

export class ApiError extends Error {
  public status: number;
  public errors?: Array<{ field?: string; message: string }>;

  constructor(status: number, message: string, errors?: Array<{ field?: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface RequestOptions extends RequestInit {
  tokenType?: 'customer' | 'admin' | 'auto';
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'blob' | 'json' | 'text' | 'arraybuffer';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
  errors?: Array<{ field?: string; message: string }>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { tokenType = 'auto', params, headers = {}, ...customConfig } = options;

  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const isFormData = typeof FormData !== 'undefined' && customConfig.body instanceof FormData;

  const reqHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string>),
  };

  // When submitting FormData, browser / fetch MUST generate the boundary parameter automatically
  if (isFormData) {
    delete reqHeaders['Content-Type'];
    delete reqHeaders['content-type'];
  }

  // Determine which token to attach
  let token: string | null = null;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (tokenType === 'admin') {
    token = localStorage.getItem('loan_approve_admin_token');
  } else if (tokenType === 'customer') {
    token = localStorage.getItem('loan_approve_customer_token');
  } else {
    // Route-aware smart token selection
    if (cleanEndpoint.startsWith('/admin')) {
      token = localStorage.getItem('loan_approve_admin_token');
    } else if (cleanEndpoint.startsWith('/customer') || cleanEndpoint.startsWith('/customers')) {
      token = localStorage.getItem('loan_approve_customer_token');
    } else {
      // Auto: strictly check active role and do not fall back across roles
      const activeRole = localStorage.getItem('loan_approve_active_role');
      if (activeRole === 'ADMIN') {
        token = localStorage.getItem('loan_approve_admin_token');
      } else if (activeRole === 'CUSTOMER') {
        token = localStorage.getItem('loan_approve_customer_token');
      } else {
        token = localStorage.getItem('loan_approve_customer_token') || localStorage.getItem('loan_approve_admin_token');
      }
    }
  }

  if (token && !reqHeaders['Authorization']) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method: options.method || 'GET',
    headers: reqHeaders,
    ...customConfig,
  };

  try {
    const response = await fetch(url, config);

    // If HTTP error response (401, 403, 404, 500, etc.)
    if (!response.ok) {
      let data: any = null;
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      } catch {
        data = null;
      }
      const errorMessage = data?.message || `HTTP ${response.status}: ${response.statusText}`;

      // Handle token expiration / unauthorized in a role-scoped manner
      if (response.status === 401 && !cleanEndpoint.includes('/auth/')) {
        if (cleanEndpoint.startsWith('/admin')) {
          localStorage.removeItem('loan_approve_admin_token');
          if (localStorage.getItem('loan_approve_active_role') === 'ADMIN') {
            localStorage.removeItem('loan_approve_active_role');
          }
        } else if (cleanEndpoint.startsWith('/customer') || cleanEndpoint.startsWith('/customers')) {
          localStorage.removeItem('loan_approve_customer_token');
          if (localStorage.getItem('loan_approve_active_role') === 'CUSTOMER') {
            localStorage.removeItem('loan_approve_active_role');
          }
        } else {
          localStorage.removeItem('loan_approve_customer_token');
          localStorage.removeItem('loan_approve_admin_token');
          localStorage.removeItem('loan_approve_active_role');
        }
      }

      throw new ApiError(response.status, errorMessage, data?.errors);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: {} } as unknown as T;
    }

    // If client requested blob for successful HTTP responses
    if ((options as { responseType?: string }).responseType === 'blob') {
      const blob = await response.blob();
      return {
        data: blob,
        headers: {
          'content-type': response.headers?.get ? (response.headers.get('content-type') || 'application/octet-stream') : 'application/octet-stream',
          'content-disposition': response.headers?.get ? (response.headers.get('content-disposition') || '') : '',
        },
      } as unknown as T;
    }

    // If client requested arraybuffer for successful HTTP responses
    if ((options as { responseType?: string }).responseType === 'arraybuffer') {
      const arrayBuffer = await response.arrayBuffer();
      return {
        data: arrayBuffer,
        headers: {
          'content-type': response.headers?.get ? (response.headers.get('content-type') || 'application/octet-stream') : 'application/octet-stream',
          'content-disposition': response.headers?.get ? (response.headers.get('content-disposition') || '') : '',
        },
      } as unknown as T;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = data?.message || `HTTP ${response.status}: ${response.statusText}`;

      // Handle token expiration / unauthorized in a role-scoped manner
      if (response.status === 401 && !cleanEndpoint.includes('/auth/')) {
        if (cleanEndpoint.startsWith('/admin')) {
          localStorage.removeItem('loan_approve_admin_token');
          if (localStorage.getItem('loan_approve_active_role') === 'ADMIN') {
            localStorage.removeItem('loan_approve_active_role');
          }
        } else if (cleanEndpoint.startsWith('/customer') || cleanEndpoint.startsWith('/customers')) {
          localStorage.removeItem('loan_approve_customer_token');
          if (localStorage.getItem('loan_approve_active_role') === 'CUSTOMER') {
            localStorage.removeItem('loan_approve_active_role');
          }
        } else {
          localStorage.removeItem('loan_approve_customer_token');
          localStorage.removeItem('loan_approve_admin_token');
          localStorage.removeItem('loan_approve_active_role');
        }
      }

      throw new ApiError(response.status, errorMessage, data?.errors);
    }

    return (data ?? {}) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network error or service unavailable';
    throw new ApiError(500, message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apiClient.get = async (endpoint: string, options?: RequestOptions & { responseType?: string }): Promise<any> => {
  return apiClient<unknown>(endpoint, { ...options, method: 'GET' });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apiClient.post = async (endpoint: string, body?: unknown, options?: RequestOptions): Promise<any> => {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  return apiClient<unknown>(endpoint, {
    ...options,
    method: 'POST',
    body: isFormData ? (body as FormData) : JSON.stringify(body),
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apiClient.put = async (endpoint: string, body?: unknown, options?: RequestOptions): Promise<any> => {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  return apiClient<unknown>(endpoint, {
    ...options,
    method: 'PUT',
    body: isFormData ? (body as FormData) : JSON.stringify(body),
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apiClient.patch = async (endpoint: string, body?: unknown, options?: RequestOptions): Promise<any> => {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  return apiClient<unknown>(endpoint, {
    ...options,
    method: 'PATCH',
    body: isFormData ? (body as FormData) : JSON.stringify(body),
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apiClient.delete = async (endpoint: string, options?: RequestOptions): Promise<any> => {
  return apiClient<unknown>(endpoint, { ...options, method: 'DELETE' });
};

export const api = apiClient;

