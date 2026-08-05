import { Text, type TextStyle, type StyleProp } from 'react-native';
import { useColors } from '@/context/ThemeContext';

type Props = {
  text: string;
  query?: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
};

function splitByQuery(text: string, query: string): { part: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ part: text, match: false }];

  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const chunks: { part: string; match: boolean }[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx < 0) {
      chunks.push({ part: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      chunks.push({ part: text.slice(cursor, idx), match: false });
    }
    chunks.push({
      part: text.slice(idx, idx + needle.length),
      match: true,
    });
    cursor = idx + needle.length;
  }

  return chunks.length ? chunks : [{ part: text, match: false }];
}

export function HighlightText({
  text,
  query,
  style,
  highlightStyle,
}: Props) {
  const colors = useColors();
  const chunks = splitByQuery(text, query ?? '');

  return (
    <Text style={style}>
      {chunks.map((chunk, i) =>
        chunk.match ? (
          <Text
            key={`${i}-${chunk.part}`}
            style={[
              style,
              { backgroundColor: colors.primary + '44', fontWeight: '700' },
              highlightStyle,
            ]}
          >
            {chunk.part}
          </Text>
        ) : (
          chunk.part
        )
      )}
    </Text>
  );
}
