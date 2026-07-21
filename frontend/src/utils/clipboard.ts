import { message } from "antd";

export function fallbackCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  return ok;
}

export function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => message.success("Скопировано"),
      () => {
        fallbackCopy(text) ? message.success("Скопировано") : message.error("Не удалось скопировать");
      },
    );
  } else {
    fallbackCopy(text) ? message.success("Скопировано") : message.error("Не удалось скопировать");
  }
}
