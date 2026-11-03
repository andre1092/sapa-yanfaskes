// Adapted from Berry Free vite/src/ui-component/cards/MainCard.jsx (MIT).
import { Card, CardContent, CardHeader, Divider, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { CardProps } from '@mui/material/Card';
export default function MainCard({ children, title, secondary, content = true, className, sx, component = 'section', ...others }: Omit<CardProps, 'title' | 'content'> & {
  title?: ReactNode; secondary?: ReactNode; content?: boolean; component?: 'section' | 'div' | 'article';
}) {
  return <Card {...others} component={component} className={`berry-main-card ${className || ''}`} sx={sx}>
    {title && <><CardHeader title={<Typography component="h2" variant="h3">{title}</Typography>} action={secondary} /><Divider /></>}
    {content ? <CardContent>{children}</CardContent> : children}
  </Card>;
}
