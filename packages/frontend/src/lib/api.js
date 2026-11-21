"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function getTenantSlugFromHost() {
  if (typeof window === 'undefined') return '';
  const host = window.location.host;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (sub && sub !== 'www') return sub.toLowerCase();
  }
  return '';
}

export async function apiFetch(path, options = {}) {
  const tenantSlug = getTenantSlugFromHost();
  const activeTenantId =
    typeof window !== 'undefined' ? window.localStorage.getItem('ah_active_tenant_id') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    ...(activeTenantId ? { 'x-tenant-id': activeTenantId } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data?.error || `Request failed (${res.status})`,
      data,
    };
  }

  return { ok: true, status: res.status, data };
}
