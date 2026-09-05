import { useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRunAgentChat } from '@core/hooks/useRunAgentChat';
import { CHAT_MAX_LENGTH } from '@core/services/runAgentChat';
import styles from './style.module.css';

const examples = ['一周跑几次比较合适？', '跑前热身应该怎么做？'];
const markdownComponents = {
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
const markdownPlugins = [remarkGfm];

export default function ChatAssistant() {
  const chat = useRunAgentChat();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const followBottomRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [readingEarlier, setReadingEarlier] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function scrollToLatest() {
    if (listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight;
    followBottomRef.current = true;
    setReadingEarlier(false);
  }

  useEffect(() => {
    if (open && followBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chat.messages, chat.pending, open]);

  function close() {
    chat.cancel();
    composingRef.current = false;
    dialogRef.current?.close();
    setOpen(false);
    launcherRef.current?.focus();
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="runagent-chat"
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <span aria-hidden="true">✦</span> AI 跑步助手
      </button>
      <dialog
        ref={dialogRef}
        id="runagent-chat"
        lang="zh-CN"
        className={styles.dialog}
        aria-labelledby="runagent-title"
        aria-describedby="runagent-notice"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), textarea, a[href], [tabindex="0"]'
            )
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id="runagent-title">AI 跑步助手</h2>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => {
                  chat.clear();
                  scrollToLatest();
                  inputRef.current?.focus();
                }}
              >
                清空对话
              </button>
              <button
                type="button"
                className={styles.close}
                aria-label="关闭聊天"
                onClick={close}
              >
                ×
              </button>
            </div>
          </header>
          <p id="runagent-notice" className={styles.notice}>
            当前为单轮问答，暂未读取个人跑步记录。
          </p>
          <div
            ref={listRef}
            className={styles.messages}
            role="region"
            aria-label="对话消息"
            tabIndex={0}
            onScroll={() => {
              const element = listRef.current;
              if (!element) return;
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                48;
              followBottomRef.current = nearBottom;
              setReadingEarlier(!nearBottom);
            }}
          >
            {chat.messages.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.spark} aria-hidden="true">
                  ✦
                </span>
                <h3>聊聊跑步吧</h3>
                <p>从一个小问题开始</p>
                {examples.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      chat.setDraft(question);
                      inputRef.current?.focus();
                    }}
                  >
                    {question}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            )}
            {chat.messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === 'user' ? styles.user : styles.assistant
                }
                aria-label={message.role === 'user' ? '你' : '助手'}
              >
                <p className={styles.role}>
                  {message.role === 'user' ? '你' : 'AI 跑步助手'}
                </p>
                <div className={styles.content}>
                  {message.role === 'assistant' ? (
                    <Markdown
                      skipHtml
                      components={markdownComponents}
                      remarkPlugins={markdownPlugins}
                    >
                      {message.content}
                    </Markdown>
                  ) : (
                    <p className={styles.question}>{message.content}</p>
                  )}
                </div>
              </article>
            ))}
            <p role="status" className={styles.status}>
              {chat.pending
                ? '正在思考…'
                : chat.messages.at(-1)?.role === 'assistant'
                  ? '回答已就绪'
                  : ''}
            </p>
          </div>
          {readingEarlier && (
            <button
              type="button"
              className={styles.latest}
              onClick={scrollToLatest}
            >
              查看最新消息 ↓
            </button>
          )}
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void chat.send();
            }}
          >
            {chat.error && (
              <p role="alert" className={styles.error}>
                {chat.error}
              </p>
            )}
            <label htmlFor="runagent-question" className={styles.inputLabel}>
              你的问题
            </label>
            <textarea
              ref={inputRef}
              id="runagent-question"
              rows={3}
              maxLength={CHAT_MAX_LENGTH}
              value={chat.draft}
              readOnly={chat.pending}
              placeholder="输入跑步相关的问题…"
              aria-describedby="runagent-input-hint"
              onChange={(event) => chat.setDraft(event.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !composingRef.current &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  void chat.send();
                }
              }}
            />
            <div className={styles.composerFooter}>
              <span id="runagent-input-hint">
                Enter 发送 · Shift+Enter 换行
              </span>
              <button
                type="submit"
                className={styles.send}
                disabled={chat.pending || !chat.draft.trim()}
              >
                {chat.error ? '重试' : '发送'} <span aria-hidden="true">↑</span>
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
