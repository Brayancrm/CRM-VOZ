import { DateTimeSelector } from '@/components/DateTimeSelector';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

/** Só dia, mês e ano (filtro da agenda). */
export function ScheduleDayPicker({ value, onChange }: Props) {
  return (
    <DateTimeSelector
      value={value}
      onChange={onChange}
      label="Dia"
      showTime={false}
    />
  );
}
