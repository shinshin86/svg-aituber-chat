import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { shouldSubmitChat } from '../lib/chatKeyboard';
import type { ChatMessage } from '../types/chat';

interface ChatPanelProps {
  messages: ChatMessage[];
  partialResponse: string;
  isProcessing: boolean;
  disabledReason: string;
  error: string;
  onSend: (message: string) => Promise<void>;
  onClear: () => void;
}

export function ChatPanel({
  messages,
  partialResponse,
  isProcessing,
  disabledReason,
  error,
  onSend,
  onClear,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialResponse]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || isProcessing || disabledReason) return;
    setInput('');
    await onSend(message);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitChat({
      key: event.key,
      shiftKey: event.shiftKey,
      keyCode: event.keyCode,
      isComposing: event.nativeEvent.isComposing,
    })) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <section className="chat-panel" aria-label="チャット">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2>チャット</h2>
        </div>
        {messages.length > 0 && (
          <button className="text-button" type="button" onClick={onClear}>
            履歴を消去
          </button>
        )}
      </div>

      <div className="messages" aria-live="polite">
        {messages.length === 0 && !partialResponse && (
          <div className="empty-state">
            <span className="empty-mark">✦</span>
            <p>設定を済ませて、ミコに話しかけてください。</p>
            <small>返答は音声で再生され、声の大きさに合わせて口が動きます。</small>
          </div>
        )}
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <span>
              {message.role === 'assistant'
                ? 'ミコ'
                : message.source === 'youtube'
                  ? `${message.author || 'YouTube視聴者'} · YouTube`
                  : 'あなた'}
            </span>
            <p>{message.content}</p>
          </article>
        ))}
        {partialResponse && (
          <article className="message assistant streaming">
            <span>ミコ</span>
            <p>{partialResponse}<i className="cursor" /></p>
          </article>
        )}
        {isProcessing && !partialResponse && (
          <div className="thinking" aria-label="応答を生成中">
            <i /><i /><i />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(error || disabledReason) && (
        <p className={error ? 'form-message error' : 'form-message'}>
          {error || disabledReason}
        </p>
      )}

      <form className="chat-form" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力…"
          rows={2}
          disabled={isProcessing || Boolean(disabledReason)}
          aria-label="チャットメッセージ"
        />
        <button
          className="send-button"
          type="submit"
          disabled={!input.trim() || isProcessing || Boolean(disabledReason)}
        >
          {isProcessing ? '生成中' : '送信'}
        </button>
      </form>
      <p className="input-hint">Enterで送信・Shift+Enterで改行</p>
    </section>
  );
}
