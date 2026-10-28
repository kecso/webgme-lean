export function checkText(text: string): {
  ok: boolean;
  messages: { severity: string; message: string }[];
};
