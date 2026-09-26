export function toCsv(rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\ufeff${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvDate(at: number | null): string {
  return at ? new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

export function csvNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
