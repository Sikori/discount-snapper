"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { mapsUrl } from "@/lib/logic";

export type Pin = { lat: number; lon: number; title: string; lines: string[] };

export default function MapView(props: { lat: number; lon: number; radiusKm: number; pins: Pin[] }) {
  const { lat, lon, radiusKm, pins } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { center: [51.2, 10.4], zoom: 6 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap-Mitwirkende",
      maxZoom: 19,
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current!;
    const g = layer.current!;
    g.clearLayers();
    const circle = L.circle([lat, lon], { radius: radiusKm * 1000, fill: false, weight: 1 }).addTo(g);
    L.circleMarker([lat, lon], { radius: 5, color: "#111", fillOpacity: 1 }).addTo(g).bindPopup("Dein Standort");
    for (const p of pins) {
      // Built as DOM nodes: offer text comes from outside and must not be parsed as HTML.
      const box = document.createElement("div");
      const head = box.appendChild(document.createElement("strong"));
      head.textContent = p.title;
      for (const line of p.lines) box.appendChild(document.createElement("div")).textContent = line;
      const a = box.appendChild(document.createElement("a"));
      a.href = mapsUrl(p.lat, p.lon);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "In Karten-App öffnen";
      L.circleMarker([p.lat, p.lon], { radius: 8, color: "#c2410c", fillOpacity: 0.7 }).addTo(g).bindPopup(box);
    }
    m.fitBounds(circle.getBounds());
  }, [lat, lon, radiusKm, pins]);

  return <div ref={el} className="map" role="application" aria-label="Karte der Märkte mit Angeboten" />;
}
