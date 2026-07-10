import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./site.module.css";

type PackMarkdownProps = {
  content: string;
};

export default function PackMarkdown({ content }: PackMarkdownProps) {
  return (
    <div className={styles.packMarkdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className={styles.packH1}>{children}</h1>,
          h2: ({ children }) => <h2 className={styles.packH2}>{children}</h2>,
          h3: ({ children }) => <h3 className={styles.packH3}>{children}</h3>,
          p: ({ children }) => <p className={styles.packParagraph}>{children}</p>,
          ul: ({ children }) => <ul className={styles.packList}>{children}</ul>,
          ol: ({ children }) => <ol className={styles.packListOrdered}>{children}</ol>,
          li: ({ children }) => <li className={styles.packListItem}>{children}</li>,
          table: ({ children }) => (
            <div className={styles.packTableWrap}>
              <table className={styles.packTable}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th className={styles.packTh}>{children}</th>,
          td: ({ children }) => <td className={styles.packTd}>{children}</td>,
          a: ({ href, children }) => {
            const url = href ?? "#";
            if (url.startsWith("/")) {
              return (
                <Link href={url} className={styles.packLink}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={url} className={styles.packLink} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          strong: ({ children }) => <strong className={styles.packStrong}>{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function PackNavLinks({ slug }: { slug: string }) {
  return (
    <nav className={styles.packNav} aria-label="Article formats">
      <Link href={`/news/${slug}`} className={styles.packNavLink}>
        Article
      </Link>
      <Link href={`/news/${slug}/guide`} className={styles.packNavLink}>
        Guide
      </Link>
      <Link href={`/news/${slug}/faq`} className={styles.packNavLink}>
        FAQ
      </Link>
    </nav>
  );
}
