import React, { useEffect, useRef } from 'react';
import type { JsonValidationStatus } from '../../hooks/useConfigManager.js';
import { Button } from '../atoms/Button.js';
import { cn } from '../../utils/cn.js';

export interface RawJsonSectionProps {
  rawJson: string;
  validationStatus: JsonValidationStatus | null;
  onChange: (value: string) => void;
  onApply: () => void;
  className?: string;
}

export function RawJsonSection({
  rawJson,
  validationStatus,
  onChange,
  onApply,
  className,
}: RawJsonSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== rawJson) {
      textareaRef.current.value = rawJson;
    }
  }, [rawJson]);

  return (
    <details id="json-editor-details" className={cn('group', className)}>
      <summary
        id="section-editor-title"
        className="cursor-pointer font-bold text-slate-800 hover:text-slate-950 py-1"
      >
        Advanced: Raw JSON Configuration
      </summary>
      <div className="editor-container flex flex-col gap-3 mt-3">
        <label htmlFor="raw-json-textarea" className="visually-hidden">
          Raw JSON configuration editor
        </label>
        <textarea
          ref={textareaRef}
          id="raw-json-textarea"
          rows={12}
          spellCheck={false}
          aria-label="Raw JSON configuration editor"
          onChange={(e) => onChange(e.target.value)}
          className="w-full font-mono text-xs sm:text-sm p-3 border border-slate-300 rounded bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="editor-actions flex items-center gap-4">
          <Button
            type="button"
            id="btn-apply-json"
            variant="secondary"
            onClick={onApply}
          >
            Apply & Validate
          </Button>
          <span
            id="json-validation-msg"
            className={cn(
              'validation-msg text-sm font-medium',
              validationStatus?.isValid ? 'valid text-emerald-600' : 'invalid text-red-600',
            )}
            aria-live="polite"
          >
            {validationStatus?.message || ''}
          </span>
        </div>
      </div>
    </details>
  );
}
