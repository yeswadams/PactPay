"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
export function Filters({
  statuses,
  sorting = false,
  placeholder = "Search records…",
}: {
  statuses: { value: string; label: string }[];
  sorting?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next}`);
  }
  return (
    <form
      className="filters"
      onSubmit={(event) => {
        event.preventDefault();
        update("q", String(new FormData(event.currentTarget).get("q") ?? ""));
      }}
    >
      <label className="search-input">
        <Search size={16} />
        <input
          key={params.get("q")}
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder={placeholder}
          aria-label="Search records"
        />
      </label>
      <select
        aria-label="Filter by status"
        className="field"
        value={params.get("status") ?? ""}
        onChange={(event) => update("status", event.target.value)}
      >
        <option value="">All statuses</option>
        {statuses.map((status) => (
          <option value={status.value} key={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      {sorting && (
        <select
          aria-label="Sort financing offers"
          className="field"
          value={params.get("sort") ?? "newest"}
          onChange={(event) => update("sort", event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="maturity">Maturity date</option>
          <option value="target">Funding target</option>
        </select>
      )}
      <Button type="submit" variant="secondary" size="sm">
        Search
      </Button>
    </form>
  );
}
export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function navigate(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", nextPage.toString());
    router.push(`${pathname}?${next}`);
  }
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} records`
          : "0 records"}
      </span>
      <div className="row">
        <Button
          aria-label="Previous page"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => navigate(page - 1)}
        >
          <ChevronLeft size={13} /> Previous
        </Button>
        <Button
          aria-label="Next page"
          variant="secondary"
          size="sm"
          disabled={page * pageSize >= total}
          onClick={() => navigate(page + 1)}
        >
          Next <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  );
}
