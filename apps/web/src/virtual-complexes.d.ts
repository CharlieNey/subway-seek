/** Every station complex for the stamp book, built from the dataset (vite.config.ts). */
declare module "virtual:complexes" {
  const complexes: [id: string, name: string, borough: string, routes: string[]][];
  export default complexes;
}
