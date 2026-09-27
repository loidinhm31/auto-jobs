import React, { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from '../../types/component-contracts.js';
import { cn } from '../../utils/cn.js';

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { asChild = false, className, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return React.createElement(
    Comp,
    {
      ref,
      className: cn('card bg-white border border-slate-200 rounded-lg shadow-xs', className),
      ...rest,
    },
    children,
  );
});

Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { asChild = false, className, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return React.createElement(
    Comp,
    {
      ref,
      className: cn('card-header flex flex-col space-y-1.5 p-5 pb-3', className),
      ...rest,
    },
    children,
  );
});

CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { asChild = false, className, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'h3';
  return React.createElement(
    Comp,
    {
      ref,
      className: cn(
        'card-title text-base font-semibold leading-none tracking-tight text-slate-900',
        className,
      ),
      ...rest,
    },
    children,
  );
});

CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  function CardDescription({ asChild = false, className, children, ...rest }, ref) {
    const Comp = asChild ? Slot : 'p';
    return React.createElement(
      Comp,
      {
        ref,
        className: cn('card-description text-xs text-slate-500', className),
        ...rest,
      },
      children,
    );
  },
);

CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent(
  { asChild = false, className, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return React.createElement(
    Comp,
    {
      ref,
      className: cn('card-content p-5 pt-0', className),
      ...rest,
    },
    children,
  );
});

CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { asChild = false, className, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return React.createElement(
    Comp,
    {
      ref,
      className: cn('card-footer flex items-center p-5 pt-0', className),
      ...rest,
    },
    children,
  );
});

CardFooter.displayName = 'CardFooter';
