import { useCallback } from "react";

export function ResizableHeaderCell(props: any) {
  const {
    onResize,
    width,
    "data-column-key": colKey,
    children,
    className,
    style,
    title,
    scope,
    colSpan,
    rowSpan,
    onClick,
    onKeyDown,
    onMouseEnter,
    onMouseLeave,
    ...rest
  } = props;

  const canResize = !!colKey && typeof width === "number" && !!onResize;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canResize) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(40, Math.round(startWidth + delta));
        onResize?.(colKey, newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [canResize, colKey, width, onResize]
  );

  const thStyle: React.CSSProperties = {
    ...style,
    width,
    position: "relative",
  };

  return (
    <th
      className={className}
      style={thStyle}
      title={title}
      scope={scope}
      colSpan={colSpan}
      rowSpan={rowSpan}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
      {canResize && (
        <div
          onMouseDown={onMouseDown}
          title="Перетащите для изменения ширины столбца"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 5,
            cursor: "col-resize",
            zIndex: 10,
            background: "#d9d9d9",
            borderRadius: 1,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "#1677ff";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = "#d9d9d9";
          }}
        />
      )}
    </th>
  );
}
