'use client';

import dynamic from 'next/dynamic';

// AntV charts touch `window`/canvas, so they must load client-side only.
// next/dynamic requires the options to be an inline object literal.
export const Line = dynamic(() => import('@ant-design/charts').then((m) => m.Line), { ssr: false });
export const Column = dynamic(() => import('@ant-design/charts').then((m) => m.Column), { ssr: false });
export const Bar = dynamic(() => import('@ant-design/charts').then((m) => m.Bar), { ssr: false });
export const Gauge = dynamic(() => import('@ant-design/charts').then((m) => m.Gauge), { ssr: false });
export const Pie = dynamic(() => import('@ant-design/charts').then((m) => m.Pie), { ssr: false });
export const DualAxes = dynamic(() => import('@ant-design/charts').then((m) => m.DualAxes), { ssr: false });
export const Area = dynamic(() => import('@ant-design/charts').then((m) => m.Area), { ssr: false });
