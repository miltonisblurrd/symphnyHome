import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Inspired Closets login";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(
    join(process.cwd(), "public/inspired-closets/InspiredClosets_Logo_RGB-300x277.png"),
  );
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#efe9e5",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#ffffff",
            borderRadius: 28,
            padding: "44px 80px 52px",
          }}
        >
          <img src={src} width={220} height={203} alt="" />
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 54,
              fontWeight: 700,
              color: "#111111",
              letterSpacing: -1,
            }}
          >
            Inspired Closets login
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
