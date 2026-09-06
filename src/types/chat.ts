export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  author?: string;
  source?: 'local' | 'youtube';
}
