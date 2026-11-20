import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MAX_LENGTH,
  ChatError,
  requestChat,
} from '../services/runAgentChat';
import type {
  RunningAdviceContext,
  RunningEvidence,
} from '../services/runAgentEvidence';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  evidence?: RunningEvidence;
}

export function useRunAgentChat(accessToken?: string, publicApi = false) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      const controller = activeRef.current;
      activeRef.current = null;
      controller?.abort();
    },
    []
  );

  function cancel() {
    const controller = activeRef.current;
    // Invalidate callbacks before aborting, including already resolved requests.
    activeRef.current = null;
    controller?.abort();
    setPending(false);
  }

  function clear() {
    cancel();
    setMessages([]);
    setDraft('');
    setError(null);
  }

  async function send(context?: RunningAdviceContext, question = draft) {
    const message = question.trim();
    if (activeRef.current || !message) return;
    if (
      (publicApi || accessToken !== undefined
        ? [...message].length
        : message.length) > CHAT_MAX_LENGTH
    ) {
      setError(new ChatError('input').message);
      return;
    }
    const controller = new AbortController();
    activeRef.current = controller;
    setPending(true);
    setError(null);
    setMessages((previous) => {
      const last = previous.at(-1);
      if (last?.role === 'user' && last.content === message) return previous;
      return [
        ...previous,
        { id: crypto.randomUUID(), role: 'user', content: message },
      ];
    });
    try {
      const response = await requestChat(
        { message, context },
        controller.signal,
        undefined,
        accessToken,
        publicApi
      );
      if (activeRef.current !== controller) return;
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.content,
          evidence: response.evidence,
        },
      ]);
      setDraft('');
    } catch (failure: unknown) {
      if (activeRef.current !== controller) return;
      if (failure instanceof ChatError && failure.kind === 'cancelled') return;
      setError(
        failure instanceof ChatError ? failure.message : '发送失败，请重试。'
      );
    } finally {
      if (activeRef.current === controller) {
        activeRef.current = null;
        setPending(false);
      }
    }
  }

  return { messages, draft, setDraft, pending, error, send, cancel, clear };
}
