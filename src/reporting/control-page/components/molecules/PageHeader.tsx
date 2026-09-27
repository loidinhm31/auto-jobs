import React, { forwardRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { PageHeaderProps } from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  function PageHeader(
    {
      title,
      subtitle,
      backLink,
      breadcrumbs,
      badges,
      actions,
      className,
      containerClassName,
      id,
      titleId,
      level = 1,
    },
    ref,
  ) {
    const HeadingTag = level === 2 ? 'h2' : 'h1';

    const leadingChildren: React.ReactNode[] = [];

    if (breadcrumbs) {
      leadingChildren.push(breadcrumbs);
    } else if (backLink) {
      leadingChildren.push(
        React.createElement(
          'nav',
          { key: 'nav', 'aria-label': 'Navigation', className: 'mb-1' },
          React.createElement(
            'a',
            {
              id: backLink.id,
              href: backLink.href,
              className: cn(
                'inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900 underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded transition-colors',
                backLink.className,
              ),
            },
            React.createElement(ArrowLeft, {
              className: 'w-4 h-4 flex-shrink-0',
              'aria-hidden': true,
            }),
            React.createElement('span', null, backLink.label),
          ),
        ),
      );
    }

    const titleRowChildren: React.ReactNode[] = [
      React.createElement(
        HeadingTag,
        {
          key: 'heading',
          id: titleId,
          className: cn(
            'm-0 font-bold text-slate-900 tracking-tight',
            level === 2 ? 'text-xl' : 'text-2xl',
          ),
        },
        title,
      ),
    ];

    if (badges) {
      titleRowChildren.push(badges);
    }

    leadingChildren.push(
      React.createElement(
        'div',
        { key: 'title-row', className: 'flex items-center gap-3 flex-wrap' },
        ...titleRowChildren,
      ),
    );

    if (subtitle) {
      leadingChildren.push(
        React.createElement(
          'p',
          { key: 'subtitle', className: 'text-sm text-slate-500 m-0' },
          subtitle,
        ),
      );
    }

    const leadingSection = React.createElement(
      'div',
      { key: 'leading', className: 'flex flex-col gap-1 min-w-0' },
      ...leadingChildren,
    );

    const containerChildren: React.ReactNode[] = [leadingSection];

    if (actions) {
      containerChildren.push(
        React.createElement(
          'div',
          {
            key: 'actions',
            className: 'page-header-actions flex items-center gap-2 flex-wrap',
          },
          actions,
        ),
      );
    }

    const container = React.createElement(
      'div',
      {
        className: cn(
          'page-header-container max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-4',
          containerClassName,
        ),
      },
      ...containerChildren,
    );

    return React.createElement(
      'header',
      {
        ref,
        id,
        className: cn('page-header bg-white border-b border-slate-200 py-4 px-6', className),
      },
      container,
    );
  },
);

PageHeader.displayName = 'PageHeader';
