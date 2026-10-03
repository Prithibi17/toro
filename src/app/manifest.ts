import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Toro ERP",
    short_name: "Toro",
    description: "Multi-company business workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1210",
    theme_color: "#ff6846",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
