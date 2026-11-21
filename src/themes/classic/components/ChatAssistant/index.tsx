import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useRunAgentChat } from '@core/hooks/useRunAgentChat';
import {
  CHAT_MAX_LENGTH,
  isPrivateChatToken,
} from '@core/services/runAgentChat';
import styles from './style.module.css';
import { StatusPanel } from '@core/components/StatusPanel';
import { useRunAgentAccess } from '../../runAgentAccess';
import { runningAdviceContext } from '@core/services/runAgentEvidence';
import {
  type RunningLocation,
  RunningEvidenceDetails,
  RunningLocationFields,
} from '../RunningAdvice';
import { useSuggestedCity } from '../RunningAdvice/useSuggestedCity';

const examples = ['一周跑几次比较合适？', '跑前热身应该怎么做？'];
const knowledgeExample = '丹尼尔斯的 T 配速训练有什么用？';
const ChatAnswer = lazy(() => import('./ChatAnswer'));
const TrainingStatsPanel = lazy(() => import('../TrainingStatsPanel'));

export default function ChatAssistant({
  privateChat = false,
  privateTraining = false,
  publicApi = false,
  trainingThrough,
}: {
  privateChat?: boolean;
  privateTraining?: boolean;
  publicApi?: boolean;
  trainingThrough?: string;
}) {
  const { accessToken, tokenRevision, setAccessToken } = useRunAgentAccess();
  const [mode, setMode] = useState<'chat' | 'training'>('chat');
  const [editedLocation, setEditedLocation] = useState<{
    city?: string;
    runningAt: string;
  }>({ runningAt: '' });
  const trainingEnabled = publicApi || (privateChat && privateTraining);
  const showTraining = trainingEnabled && mode === 'training';
  const versionedToken = publicApi
    ? accessToken || undefined
    : privateChat
      ? accessToken
      : undefined;
  const chat = useRunAgentChat(versionedToken, publicApi);
  const accessTokenRef = useRef<HTMLInputElement>(null);
  const trainingModeRef = useRef<HTMLButtonElement>(null);
  const canSend = publicApi
    ? !accessToken || isPrivateChatToken(accessToken)
    : !privateChat || isPrivateChatToken(accessToken);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const followBottomRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [readingEarlier, setReadingEarlier] = useState(false);
  const suggestedCity = useSuggestedCity(publicApi && open);
  const location: RunningLocation = {
    city: editedLocation.city ?? suggestedCity ?? '',
    runningAt: editedLocation.runningAt,
  };
  const exampleCity = location.city.trim() || '上海';
  const weatherExample = `我在${exampleCity}，现在出门跑步，需要根据天气调整什么？`;

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

  function send() {
    if (canSend)
      void chat.send(
        publicApi
          ? runningAdviceContext(location.city, location.runningAt)
          : undefined
      );
  }

  function tryExample(question: string) {
    if (!publicApi) {
      chat.setDraft(question);
      inputRef.current?.focus();
      return;
    }
    const context =
      question === weatherExample
        ? runningAdviceContext(exampleCity, '')
        : undefined;
    if (context && !location.city.trim()) {
      setEditedLocation({ city: exampleCity, runningAt: '' });
    }
    chat.setDraft(question);
    if (canSend) void chat.send(context, question);
  }

  const tokenField =
    privateChat || publicApi ? (
      <div className={styles.tokenField}>
        <label htmlFor="runagent-token" className={styles.inputLabel}>
          访问令牌
        </label>
        <input
          ref={accessTokenRef}
          id="runagent-token"
          type="password"
          autoComplete="off"
          placeholder="输入 RunAgent 访问令牌"
          value={accessToken}
          readOnly={chat.pending}
          onChange={(event) => setAccessToken(event.target.value)}
        />
      </div>
    ) : null;

  const credentials = publicApi ? (
    <details className={styles.owner}>
      <summary>站主访问</summary>
      {tokenField}
    </details>
  ) : (
    tokenField
  );

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
          const initialFocus = !canSend
            ? accessTokenRef.current
            : showTraining
              ? trainingModeRef.current
              : inputRef.current;
          initialFocus?.focus();
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
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, summary, a[href], [tabindex="0"]'
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
              {!showTraining && (
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
              )}
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
            {publicApi
              ? '查看公开训练统计，或结合跑步书籍与当地天气提问。'
              : privateChat
                ? '私有试用 · 对话、训练结果和访问令牌仅保留在本页。'
                : '开发环境 · 每次仅发送当前问题，对话仅保留在本页。个人数据是否可用由服务端决定。'}
          </p>
          {trainingEnabled && (
            <div className={styles.trainingHeader}>
              {credentials}
              <nav className={styles.modes} aria-label="助手模式">
                <button
                  type="button"
                  aria-pressed={!showTraining}
                  onClick={() => setMode('chat')}
                >
                  {publicApi ? '跑步问答' : '通用问答'}
                </button>
                <button
                  ref={trainingModeRef}
                  type="button"
                  aria-pressed={showTraining}
                  onClick={() => {
                    chat.cancel();
                    setMode('training');
                  }}
                >
                  {publicApi ? '训练统计' : '我的训练'}
                </button>
              </nav>
            </div>
          )}
          {showTraining ? (
            open && (
              <Suspense
                fallback={
                  <StatusPanel kind="loading" title="正在加载训练统计…" />
                }
              >
                {/* Invalidate prior results and pending requests when the credential changes. */}
                <TrainingStatsPanel
                  key={tokenRevision}
                  accessToken={versionedToken}
                  authorizedToSend={canSend}
                  publicApi={publicApi}
                  trainingThrough={trainingThrough}
                  location={location}
                  onLocationChange={setEditedLocation}
                />
              </Suspense>
            )
          ) : (
            <>
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
                    {(publicApi
                      ? [knowledgeExample, weatherExample]
                      : examples
                    ).map((question) => (
                      <button
                        key={question}
                        type="button"
                        disabled={chat.pending}
                        onClick={() => tryExample(question)}
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
                        <Suspense fallback={<p>{message.content}</p>}>
                          <ChatAnswer content={message.content} />
                        </Suspense>
                      ) : (
                        <p className={styles.question}>{message.content}</p>
                      )}
                    </div>
                    {message.role === 'assistant' && (
                      <RunningEvidenceDetails evidence={message.evidence} />
                    )}
                  </article>
                ))}
                {chat.pending ? (
                  <StatusPanel
                    kind="loading"
                    title="正在思考…"
                    description="最长等待 60 秒。可以取消等待后编辑问题。"
                    actionLabel="取消等待"
                    onAction={chat.cancel}
                  />
                ) : (
                  <p role="status" className={styles.status}>
                    {chat.messages.at(-1)?.role === 'assistant'
                      ? '回答已就绪'
                      : ''}
                  </p>
                )}
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
                  send();
                }}
              >
                {chat.error && (
                  <StatusPanel
                    kind="error"
                    title="回答暂不可用"
                    description={chat.error}
                  />
                )}
                {trainingEnabled ? null : credentials}
                {publicApi && (
                  <RunningLocationFields
                    location={location}
                    onChange={setEditedLocation}
                    disabled={chat.pending}
                  />
                )}
                <label
                  htmlFor="runagent-question"
                  className={styles.inputLabel}
                >
                  你的问题
                </label>
                <textarea
                  ref={inputRef}
                  id="runagent-question"
                  rows={3}
                  maxLength={
                    privateChat || publicApi
                      ? CHAT_MAX_LENGTH * 2
                      : CHAT_MAX_LENGTH
                  }
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
                      send();
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
                    disabled={chat.pending || !canSend || !chat.draft.trim()}
                  >
                    {chat.error ? '重试' : '发送'}{' '}
                    <span aria-hidden="true">↑</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
