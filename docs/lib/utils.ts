import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Prefixes a root-relative path with the deployment base path (GitHub Pages). */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export function withBasePath(pathname: string): string {
  return `${basePath}${pathname}`
}
