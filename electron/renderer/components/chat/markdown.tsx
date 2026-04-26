import { Streamdown, type Components } from 'streamdown';
import { cn } from '@/shared/utils';

const components: Components = {
	p: ({ className, ...props }) => (
		<p className={cn('my-2 leading-relaxed first:mt-0 last:mb-0', className)} {...props} />
	),
	a: ({ className, ...props }) => (
		<a
			className={cn('text-primary underline underline-offset-2 hover:no-underline', className)}
			target="_blank"
			rel="noreferrer"
			{...props}
		/>
	),
	ul: ({ className, ...props }) => (
		<ul className={cn('my-2 list-disc space-y-1 pl-5', className)} {...props} />
	),
	ol: ({ className, ...props }) => (
		<ol className={cn('my-2 list-decimal space-y-1 pl-5', className)} {...props} />
	),
	li: ({ className, ...props }) => <li className={cn('leading-relaxed', className)} {...props} />,
	h1: ({ className, ...props }) => (
		<h1 className={cn('mt-4 mb-2 text-base font-semibold', className)} {...props} />
	),
	h2: ({ className, ...props }) => (
		<h2 className={cn('mt-4 mb-2 text-sm font-semibold', className)} {...props} />
	),
	h3: ({ className, ...props }) => (
		<h3 className={cn('mt-3 mb-1.5 text-sm font-semibold', className)} {...props} />
	),
	blockquote: ({ className, ...props }) => (
		<blockquote
			className={cn('my-2 border-l-2 border-foreground/20 pl-3 text-foreground/80', className)}
			{...props}
		/>
	),
	hr: ({ className, ...props }) => (
		<hr className={cn('my-3 border-foreground/10', className)} {...props} />
	),
	table: ({ className, ...props }) => (
		<div className="my-2 overflow-x-auto">
			<table className={cn('w-full border-collapse text-xs', className)} {...props} />
		</div>
	),
	th: ({ className, ...props }) => (
		<th
			className={cn(
				'border border-foreground/10 bg-foreground/5 px-2 py-1 text-left font-semibold',
				className,
			)}
			{...props}
		/>
	),
	td: ({ className, ...props }) => (
		<td className={cn('border border-foreground/10 px-2 py-1 align-top', className)} {...props} />
	),
	code: ({ className, children, ...props }) => {
		const isBlock = typeof className === 'string' && className.includes('language-');
		if (isBlock) {
			return (
				<code
					className={cn('font-mono text-[12px] leading-relaxed', className)}
					{...props}
				>
					{children}
				</code>
			);
		}
		return (
			<code
				className={cn(
					'rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]',
					className,
				)}
				{...props}
			>
				{children}
			</code>
		);
	},
	pre: ({ className, ...props }) => (
		<pre
			className={cn(
				'my-2 overflow-x-auto rounded-md border border-foreground/10 bg-foreground/5 p-2.5 font-mono text-[12px] leading-relaxed',
				className,
			)}
			{...props}
		/>
	),
};

export function Markdown({ children }: { children: string }) {
	return (
		<div className="min-w-0 max-w-full text-[13px] [overflow-wrap:anywhere] [&_pre]:max-w-full">
			<Streamdown components={components}>{children}</Streamdown>
		</div>
	);
}
