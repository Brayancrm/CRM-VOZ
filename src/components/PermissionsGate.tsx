import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  AppState,
  Dimensions,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import {
  checkAllPermissions,
  permissionsAllGranted,
  requestSinglePermission,
  openAppSettings,
  type PermissionCheck,
  type PermissionKind,
} from '@/services/permissionsSetup';
import { requestIgnoreBatteryOptimizations } from '@/services/deviceSetup';
import { useThemedStyles } from '@/hooks/useThemedStyles';

type SlideKind = PermissionKind | 'battery';

type PermissionSlide = {
  id: SlideKind;
  title: string;
  why: string;
  isOk: (c: PermissionCheck) => boolean;
};

const SLIDES: PermissionSlide[] = [
  {
    id: 'mic',
    title: 'Microfone',
    why: 'Precisamos do microfone para ouvir o chamamento («Olá…»), gravar notas por voz e os comandos da assistente.',
    isOk: (c) => c.mic,
  },
  {
    id: 'notifications',
    title: 'Notificações',
    why: 'Usamos notificações para lembrar ligações agendadas e avisar quando uma nota ou pós-chamada está pronta.',
    isOk: (c) => c.notifications,
  },
  {
    id: 'phone',
    title: 'Telefone e registo',
    why: 'Detecta quando a chamada começa ou termina e ajuda a identificar o número para abrir a nota do contacto certo no CRM.',
    isOk: (c) => c.phone && c.callLog,
  },
  {
    id: 'contacts',
    title: 'Contactos',
    why: 'Serve para importar e reconhecer nomes e telefones, para a assistente saber «para quem» é a nota ou o agendamento.',
    isOk: (c) => c.contacts,
  },
  {
    id: 'calendar',
    title: 'Calendário',
    why: 'Mostra eventos do telemóvel junto com a agenda do SeCretina e permite criar lembretes alinhados.',
    isOk: (c) => c.calendar,
  },
  {
    id: 'battery',
    title: 'Bateria sem restrições',
    why: 'No Samsung e outros Android, a poupança de bateria pode matar a detecção de chamadas e a bolha flutuante. Sem restrições, o SeCretina continua a funcionar em segundo plano.',
    isOk: (c) => c.batteryUnrestricted,
  },
];

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 420);

export function PermissionsGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(Platform.OS !== 'android');
  const [checking, setChecking] = useState(Platform.OS === 'android');
  const [loadingKind, setLoadingKind] = useState<SlideKind | null>(null);
  const [check, setCheck] = useState<PermissionCheck | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<PermissionSlide>>(null);

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      root: {
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: 48,
        paddingBottom: 24,
      },
      header: { paddingHorizontal: 24, marginBottom: 12, gap: 8 },
      title: { fontSize: 24, fontWeight: '800', color: c.text },
      lead: { fontSize: 15, color: c.textMuted, lineHeight: 22 },
      warn: {
        fontSize: 14,
        color: c.danger,
        lineHeight: 20,
        fontWeight: '600',
        paddingHorizontal: 24,
        marginBottom: 8,
      },
      slide: {
        width: SCREEN_W,
        paddingHorizontal: (SCREEN_W - CARD_W) / 2,
        justifyContent: 'center',
      },
      card: {
        width: CARD_W,
        minHeight: 280,
        backgroundColor: c.surface,
        borderRadius: 16,
        padding: 22,
        borderWidth: 1,
        borderColor: c.border,
        gap: 14,
        justifyContent: 'space-between',
      },
      slideTitle: { fontSize: 22, fontWeight: '800', color: c.text },
      why: { fontSize: 16, color: c.textMuted, lineHeight: 24, flexGrow: 1 },
      status: { fontSize: 15, fontWeight: '700' },
      ok: { color: c.primary },
      bad: { color: c.danger },
      dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginVertical: 16,
      },
      dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: c.border,
      },
      dotActive: { backgroundColor: c.primary, width: 18 },
      actions: { paddingHorizontal: 24, gap: 10 },
      footer: {
        fontSize: 13,
        color: c.textMuted,
        lineHeight: 20,
        paddingHorizontal: 24,
        marginTop: 12,
        textAlign: 'center',
      },
      center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
      progress: {
        fontSize: 13,
        color: c.textMuted,
        paddingHorizontal: 24,
        marginBottom: 4,
      },
    })
  );

  const syncPermissions = useCallback(async () => {
    const c = await checkAllPermissions();
    setCheck(c);
    setReady(permissionsAllGranted(c));
    return c;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let cancelled = false;
    (async () => {
      try {
        const c = await checkAllPermissions();
        if (cancelled) return;
        setCheck(c);
        setReady(permissionsAllGranted(c));
        const firstPending = SLIDES.findIndex((s) => !s.isOk(c));
        if (firstPending >= 0) {
          setIndex(firstPending);
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({
              index: firstPending,
              animated: false,
            });
          });
        }
      } catch (e) {
        console.warn('SeCretina: onboarding permissões', e);
        if (!cancelled) {
          setError('Erro ao ler permissões. Deslize e toque em Permitir.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPermissions();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [syncPermissions]);

  const requestOne = async (kind: SlideKind) => {
    setLoadingKind(kind);
    setError('');
    try {
      if (kind === 'battery') {
        await requestIgnoreBatteryOptimizations();
      } else {
        await requestSinglePermission(kind);
      }
      const c = await syncPermissions();
      const nextPending = SLIDES.findIndex((s) => !s.isOk(c));
      if (nextPending >= 0 && nextPending !== index) {
        setIndex(nextPending);
        listRef.current?.scrollToIndex({ index: nextPending, animated: true });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Falha ao pedir permissão.'
      );
    } finally {
      setLoadingKind(null);
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
  };

  const grantedCount = useMemo(() => {
    if (!check) return 0;
    return SLIDES.filter((s) => s.isOk(check)).length;
  }, [check]);

  if (Platform.OS !== 'android' || ready) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const c = check ?? {
    mic: false,
    notifications: false,
    phone: false,
    callLog: false,
    contacts: false,
    calendar: false,
    batteryUnrestricted: false,
  };

  const current = SLIDES[index] ?? SLIDES[0];
  const currentOk = current.isOk(c);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Configurar SeCretina</Text>
        <Text style={styles.lead}>
          Deslize para ver cada permissão e porque a pedimos. Autorize uma a
          uma — o app abre quando estiver tudo pronto.
        </Text>
      </View>

      <Text style={styles.progress}>
        {grantedCount} de {SLIDES.length} autorizadas · {index + 1}/{SLIDES.length}
      </Text>

      {error ? <Text style={styles.warn}>{error}</Text> : null}

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({
          length: SCREEN_W,
          offset: SCREEN_W * i,
          index: i,
        })}
        renderItem={({ item }) => {
          const ok = item.isOk(c);
          return (
            <View style={styles.slide}>
              <View style={styles.card}>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.why}>{item.why}</Text>
                <Text style={[styles.status, ok ? styles.ok : styles.bad]}>
                  {ok ? 'Autorizado ✓' : 'Pendente — toque em Permitir'}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index ? styles.dotActive : null]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        {!currentOk ? (
          <Button
            title={
              loadingKind === current.id
                ? 'Aguarde…'
                : `Permitir ${current.title}`
            }
            onPress={() => void requestOne(current.id)}
            disabled={loadingKind !== null}
          />
        ) : (
          <Button
            title={
              index < SLIDES.length - 1 ? 'Seguinte' : 'Concluir'
            }
            onPress={() => {
              if (index < SLIDES.length - 1) {
                const next = index + 1;
                setIndex(next);
                listRef.current?.scrollToIndex({ index: next, animated: true });
              } else {
                void syncPermissions();
              }
            }}
          />
        )}

        <Button
          title="Abrir configurações do Android"
          variant="secondary"
          onPress={openAppSettings}
        />
      </View>

      <Text style={styles.footer}>
        Se o Android mostrar «Não permitir», use «Abrir configurações» e active
        manualmente essa permissão.
      </Text>
    </View>
  );
}
