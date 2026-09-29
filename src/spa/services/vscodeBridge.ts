// Central VS Code webview communication bridge
const vscode = (window as any).acquireVsCodeApi?.() ?? { postMessage: () => {}, getState: () => null, setState: () => {} };

export type MessageHandler = (message: any) => void;

const listeners: Set<MessageHandler> = new Set();

window.addEventListener('message', (event) => {
  const message = event.data;
  listeners.forEach((handler) => handler(message));
});

export function sendMessage(type: string, payload?: Record<string, any>) {
  vscode.postMessage({ type, ...payload });
}

export function onMessage(handler: MessageHandler): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function getState<T = any>(): T | null {
  return vscode.getState();
}

export function setState<T = any>(state: T) {
  vscode.setState(state);
}