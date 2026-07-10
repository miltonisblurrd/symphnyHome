import styles from "./site.module.css";

type SiteHeroLiquidProps = {
  imageSrc: string;
};

export default function SiteHeroLiquid({ imageSrc }: SiteHeroLiquidProps) {
  return (
    <>
      <svg className={styles.siteHeroFilterSvg} aria-hidden>
        <defs>
          <filter
            id="site-liquid-filter"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0018 0.012"
              numOctaves="3"
              seed="42"
              result="wave"
            />
            <feTurbulence
              type="turbulence"
              baseFrequency="0.035 0.07"
              numOctaves="2"
              seed="12"
              result="ripple"
            />
            <feComposite
              in="wave"
              in2="ripple"
              operator="arithmetic"
              k2="0.62"
              k3="0.38"
              result="liquidNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="liquidNoise"
              scale="32"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feOffset in="displaced" dx="-2.5" dy="0" result="shiftR" />
            <feComponentTransfer in="shiftR" result="red">
              <feFuncR type="identity" />
              <feFuncG type="discrete" tableValues="0" />
              <feFuncB type="discrete" tableValues="0" />
            </feComponentTransfer>
            <feComponentTransfer in="displaced" result="green">
              <feFuncR type="discrete" tableValues="0" />
              <feFuncG type="identity" />
              <feFuncB type="discrete" tableValues="0" />
            </feComponentTransfer>
            <feOffset in="displaced" dx="2.5" dy="0" result="shiftB" />
            <feComponentTransfer in="shiftB" result="blue">
              <feFuncR type="discrete" tableValues="0" />
              <feFuncG type="discrete" tableValues="0" />
              <feFuncB type="identity" />
            </feComponentTransfer>
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="ca" />
            <feGaussianBlur in="ca" stdDeviation="0.4" />
          </filter>
        </defs>
      </svg>

      <div className={styles.siteHeroLiquid}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt=""
          decoding="async"
          style={{ filter: "url(#site-liquid-filter)" }}
        />
      </div>
    </>
  );
}
