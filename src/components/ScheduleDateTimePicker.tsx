import { DateTimeSelector } from '@/components/DateTimeSelector';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

/** Data/hora com seletores separados: dia, mês, ano, hora, minuto. */
export function ScheduleDateTimePicker({ value, onChange }: Props) {
  return (
    <DateTimeSelector
      value={value}
      onChange={onChange}
      label="Data e hora da ligação"
      showTime
    />
  );
}
