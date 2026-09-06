export interface ChatKeyEvent {
  key: string;
  shiftKey: boolean;
  keyCode?: number;
  isComposing?: boolean;
}

export function shouldSubmitChat(event: ChatKeyEvent): boolean {
  const isImeComposition = event.isComposing || event.keyCode === 229;
  return event.key === 'Enter' && !event.shiftKey && !isImeComposition;
}
