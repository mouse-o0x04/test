import { useState } from "react";

export function useTablePagination(defaultPageSize = 20) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const onPaginationChange = (pagination: { current?: number; pageSize?: number } | undefined) => {
    if (!pagination) return;
    if (pagination.current != null) setCurrentPage(pagination.current);
    if (pagination.pageSize != null) setPageSize(pagination.pageSize);
  };

  return {
    paginationConfig: {
      pageSize,
      current: currentPage,
      showSizeChanger: true,
      showTotal: (t: number) => `Всего: ${t}`,
      pageSizeOptions: [10, 20, 50, 100],
    },
    onPaginationChange,
  };
}
