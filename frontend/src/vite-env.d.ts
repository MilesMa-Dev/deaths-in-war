/// <reference types="vite/client" />

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module 'topojson-client' {
  export function feature(topology: any, object: any): GeoJSON.FeatureCollection;
  export function mesh(topology: any, object: any, filter?: (a: any, b: any) => boolean): GeoJSON.MultiLineString;
}
