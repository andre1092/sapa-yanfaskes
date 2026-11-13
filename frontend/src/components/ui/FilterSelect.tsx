import { Children, isValidElement, type ReactNode } from 'react';
import { FormControl, MenuItem, Select } from '@mui/material';
interface FilterOptionProps { value: string | number; children: ReactNode; disabled?: boolean; className?: string; }
export function FilterOption(_props: FilterOptionProps) { return null; }
interface FilterSelectProps {
 value: string | number; onChange: (event: { target: { value: string } }) => void; children: ReactNode;
 id?: string; 'aria-label': string; className?: string; disabled?: boolean;
}
/** Berry Material UI select preserves controlled filter contracts and keyboard navigation. */
export function FilterSelect({ value, onChange, children, id, className = '', disabled, 'aria-label': label }: FilterSelectProps) {
 const options = Children.toArray(children).filter(isValidElement<FilterOptionProps>);
 // Opsi pertama adalah nilai bawaan ("Semua ..."); nilai lain dihitung aktif oleh FilterLainnya.
 const aktif = options.length > 0 && String(value) !== String(options[0].props.value);
 return <FormControl size="small" data-filter-aktif={aktif ? 'true' : undefined} className={`sapa-filter-select ${className}`} sx={{ minWidth: 0, maxWidth: '100%', width: /w-full/.test(className) ? '100%' : undefined }}>
  <Select id={id} value={String(value)} disabled={disabled} displayEmpty
   inputProps={{ 'aria-label': label }} className="berry-filter-select"
   onChange={event => onChange({ target: { value: String(event.target.value) } })}
   MenuProps={{ PaperProps: { sx: { maxHeight: 360, maxWidth: 'calc(100vw - 32px)' } }, MenuListProps: { 'aria-label': label } }}>
    {options.map(option => <MenuItem key={String(option.props.value)} value={String(option.props.value)} disabled={option.props.disabled} sx={{ whiteSpace: 'normal', minHeight: 44, fontSize: '0.8125rem' }}>{option.props.children}</MenuItem>)}
  </Select>
 </FormControl>;
}
