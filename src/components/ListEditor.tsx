import { useEffect, useState } from 'react';
import type { Table } from 'dexie';
import { Sheet } from './ui';
import { IconTrash } from './Icons';
import { uid } from '../lib/db';
import { ImagePicker } from './ImagePicker';

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'image';
  options?: { value: string; label: string }[];
  wide?: boolean;
  placeholder?: string;
}

interface Props<T extends { id: string }> {
  title: string;
  open: boolean;
  onClose: () => void;
  rows: T[];
  fields: FieldDef<T>[];
  onSave: (row: T) => void | Promise<unknown>;
  onDelete?: (row: T) => void | Promise<unknown>;
  make?: () => Omit<T, 'id'>;
  addLabel?: string;
  itemName?: (row: T) => string;
}

// A sheet that edits a list of records in place. Every change saves straight away.
export function ListEditor<T extends { id: string }>({ title, open, onClose, rows, fields, onSave, onDelete, make, addLabel = 'Add another', itemName }: Props<T>) {
  const [draft, setDraft] = useState<T[]>(rows);
  useEffect(() => {
    if (open) setDraft(rows);
    // Only reset when the sheet opens so typing is never interrupted by live updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const change = (id: string, key: keyof T, raw: string | boolean | undefined, type?: string) => {
    const value = type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
    setDraft((list) => {
      const next = list.map((r) => (r.id === id ? { ...r, [key]: value } : r));
      const row = next.find((r) => r.id === id);
      if (row) void onSave(row);
      return next;
    });
  };

  return (
    <Sheet title={title} open={open} onClose={onClose}>
      <p className="sub">Changes save as you type.</p>
      {draft.map((row, i) => (
        <div className="edit-row" key={row.id}>
          <div className="edit-fields">
            {fields.map((f) => {
              const id = `ed-${row.id}-${f.key}`;
              const v = row[f.key] as unknown;
              if (f.type === 'image') {
                return (
                  <div className="form-col wide" key={f.key}>
                    <ImagePicker id={id} label={f.label} value={v as string | undefined} onChange={(src) => change(row.id, f.key, src)} />
                  </div>
                );
              }
              return (
                <div className={`form-col${f.wide || f.type === 'textarea' ? ' wide' : ''}`} key={f.key}>
                  <label className="lbl" htmlFor={id}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select id={id} className="field" value={String(v ?? '')} onChange={(e) => change(row.id, f.key, e.target.value)}>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea id={id} className="area" rows={2} value={String(v ?? '')} placeholder={f.placeholder} onChange={(e) => change(row.id, f.key, e.target.value)} />
                  ) : f.type === 'checkbox' ? (
                    <input id={id} type="checkbox" style={{ width: 24, height: 24 }} checked={Boolean(v)} onChange={(e) => change(row.id, f.key, e.target.checked)} />
                  ) : (
                    <input
                      id={id}
                      className="field"
                      type={f.type ?? 'text'}
                      inputMode={f.type === 'number' ? 'decimal' : undefined}
                      value={f.type === 'number' ? String(v ?? 0) : String(v ?? '')}
                      placeholder={f.placeholder}
                      onChange={(e) => change(row.id, f.key, e.target.value, f.type)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {onDelete && (
            <div className="edit-row-actions">
              <button
                type="button"
                className="btn-text btn-danger"
                onClick={() => {
                  const name = itemName?.(row) ?? `item ${i + 1}`;
                  if (!confirm(`Delete ${name}?`)) return;
                  void onDelete(row);
                  setDraft((list) => list.filter((r) => r.id !== row.id));
                }}
              >
                <IconTrash size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      ))}
      {make && (
        <button
          type="button"
          className="btn2"
          onClick={() => {
            const row = { id: uid(), ...make() } as T;
            void onSave(row);
            setDraft((list) => [...list, row]);
          }}
        >
          {addLabel}
        </button>
      )}
      <button type="button" className="btn" onClick={onClose}>Done</button>
    </Sheet>
  );
}

// Convenience wrapper for a Dexie table.
export function TableEditor<T extends { id: string }>(props: Omit<Props<T>, 'onSave' | 'onDelete'> & { table: Table<T, string>; canDelete?: boolean }) {
  const { table, canDelete = true, ...rest } = props;
  return (
    <ListEditor<T>
      {...rest}
      onSave={(row) => table.put(row)}
      onDelete={canDelete ? (row) => table.delete(row.id) : undefined}
    />
  );
}
