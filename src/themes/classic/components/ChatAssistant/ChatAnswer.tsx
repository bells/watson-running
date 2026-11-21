import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './style.module.css';

const components = {
  img: () => null,
  table: ({ children }: { children?: ReactNode }) => (
    <div
      className={styles.tableScroll}
      tabIndex={0}
      role="region"
      aria-label="回答表格"
    >
      <table>{children}</table>
    </div>
  ),
};
const remarkPlugins = [remarkGfm];

export default function ChatAnswer({ content }: { content: string }) {
  return (
    <Markdown skipHtml components={components} remarkPlugins={remarkPlugins}>
      {content}
    </Markdown>
  );
}
