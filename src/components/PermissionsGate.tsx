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
  Pressable,
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
import {
  getSecretinaLanguage,
  hasChosenSecretinaLanguage,
  SECRETINA_LANGUAGES,
  setSecretinaLanguage,
  type SecretinaLanguage,
} from '@/services/secretinaLanguage';
import { prefetchPodeFalar } from '@/services/speech';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useI18n } from '@/i18n';
import type { PtBRKey } from '@/i18n/locales/pt-BR';

type SlideKind = 'language' | PermissionKind | 'battery';

type PermissionSlide = {
  id: SlideKind;
  titleKey: PtBRKey;
  whyKey: PtBRKey;
  isOk: (c: PermissionCheck, langChosen: boolean) => boolean;
};

const SLIDES: PermissionSlide[] = [
  {
    id: 'language',
    titleKey: 'onboarding.slide.language.title',
    whyKey: 'onboarding.slide.language.why',
    isOk: (_c, langChosen) => langChosen,
  },
  {
    id: 'mic',
    titleKey: 'onboarding.slide.mic.title',
    whyKey: 'onboarding.slide.mic.why',
    isOk: (c) => c.mic,
  },
  {
    id: 'notifications',
    titleKey: 'onboarding.slide.notifications.title',
    whyKey: 'onboarding.slide.notifications.why',
    isOk: (c) => c.notifications,
  },
  {
    id: 'phone',
    titleKey: 'onboarding.slide.phone.title',
    whyKey: 'onboarding.slide.phone.why',
    isOk: (c) => c.phone && c.callLog,
  },
  {
    id: 'contacts',
    titleKey: 'onboarding.slide.contacts.title',
    whyKey: 'onboarding.slide.contacts.why',
    isOk: (c) => c.contacts,
  },
  {
    id: 'calendar',
    titleKey: 'onboarding.slide.calendar.title',
    whyKey: 'onboarding.slide.calendar.why',
    isOk: (c) => c.calendar,
  },
  {
    id: 'battery',
    titleKey: 'onboarding.slide.battery.title',
    whyKey: 'onboarding.slide.battery.why',
    isOk: (c) => c.batteryUnrestricted,
  },
];

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 420);

export function PermissionsGate({ children }: { children: ReactNode }) {
  const { t, setUiLanguage, refreshLanguage } = useI18n();
  const [ready, setReady] = useState(Platform.OS !== 'android');
  const [checking, setChecking] = useState(Platform.OS === 'android');
  const [loadingKind, setLoadingKind] = useState<SlideKind | null>(null);
  const [check, setCheck] = useState<PermissionCheck | null>(null);
  const [langChosen, setLangChosen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<SecretinaLanguage>('pt-BR');
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
      langList: { gap: 8 },
      langRow: {
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: c.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      langRowOn: {
        borderColor: c.primary,
        backgroundColor: c.chip,
      },
      langCheck: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
      },
      langCheckOn: {
        borderColor: c.primary,
        backgroundColor: c.primary,
      },
      langCheckMark: { color: '#fff', fontWeight: '800', fontSize: 12 },
      langLabel: { fontSize: 16, fontWeight: '700', color: c.text },
      langHint: { fontSize: 13, color: c.textMuted, marginTop: 2 },
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

  const refreshReady = useCallback(
    (c: PermissionCheck, chosen: boolean) => {
      setReady(chosen && permissionsAllGranted(c));
    },
    []
  );

  const syncPermissions = useCallback(async () => {
    const c = await checkAllPermissions();
    setCheck(c);
    const chosen = await hasChosenSecretinaLanguage();
    setLangChosen(chosen);
    if (chosen) {
      const stored = await getSecretinaLanguage();
      setSelectedLang(stored);
      setUiLanguage(stored);
    }
    refreshReady(c, chosen);
    return { c, chosen };
  }, [refreshReady, setUiLanguage]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let cancelled = false;
    (async () => {
      try {
        const { c, chosen } = await syncPermissions();
        if (cancelled) return;
        const firstPending = SLIDES.findIndex((s) => !s.isOk(c, chosen));
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
          setError(t('onboarding.error.read'));
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
  }, [syncPermissions, t]);

  const saveLanguageAndContinue = async () => {
    setLoadingKind('language');
    setError('');
    try {
      await setSecretinaLanguage(selectedLang);
      setUiLanguage(selectedLang);
      await refreshLanguage();
      setLangChosen(true);
      void prefetchPodeFalar();
      const { c, chosen } = await syncPermissions();
      const nextPending = SLIDES.findIndex((s) => !s.isOk(c, chosen));
      if (nextPending >= 0) {
        setIndex(nextPending);
        listRef.current?.scrollToIndex({
          index: nextPending,
          animated: true,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('onboarding.error.saveLanguage')
      );
    } finally {
      setLoadingKind(null);
    }
  };

  const requestOne = async (kind: SlideKind) => {
    if (kind === 'language') {
      await saveLanguageAndContinue();
      return;
    }
    setLoadingKind(kind);
    setError('');
    try {
      if (kind === 'battery') {
        await requestIgnoreBatteryOptimizations();
      } else {
        await requestSinglePermission(kind);
      }
      const { c, chosen } = await syncPermissions();
      const nextPending = SLIDES.findIndex((s) => !s.isOk(c, chosen));
      if (nextPending >= 0 && nextPending !== index) {
        setIndex(nextPending);
        listRef.current?.scrollToIndex({ index: nextPending, animated: true });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('onboarding.error.request')
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
    if (!check) return langChosen ? 1 : 0;
    return SLIDES.filter((s) => s.isOk(check, langChosen)).length;
  }, [check, langChosen]);

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
  const currentOk = current.isOk(c, langChosen);
  const currentTitle = t(current.titleKey);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.title')}</Text>
        <Text style={styles.lead}>{t('onboarding.lead')}</Text>
      </View>

      <Text style={styles.progress}>
        {t('onboarding.progress', {
          granted: grantedCount,
          total: SLIDES.length,
          current: index + 1,
        })}
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
          const ok = item.isOk(c, langChosen);
          return (
            <View style={styles.slide}>
              <View style={styles.card}>
                <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
                <Text style={styles.why}>{t(item.whyKey)}</Text>
                {item.id === 'language' ? (
                  <View style={styles.langList}>
                    {SECRETINA_LANGUAGES.map((opt) => {
                      const on = selectedLang === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          style={[styles.langRow, on ? styles.langRowOn : null]}
                          onPress={() => {
                            setSelectedLang(opt.id);
                            setUiLanguage(opt.id);
                          }}
                        >
                          <View
                            style={[
                              styles.langCheck,
                              on ? styles.langCheckOn : null,
                            ]}
                          >
                            {on ? (
                              <Text style={styles.langCheckMark}>✓</Text>
                            ) : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.langLabel}>{opt.label}</Text>
                            <Text style={styles.langHint}>{opt.hint}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.status, ok ? styles.ok : styles.bad]}>
                    {ok
                      ? t('onboarding.status.ok')
                      : t('onboarding.status.pending')}
                  </Text>
                )}
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
        {current.id === 'language' ? (
          <Button
            title={
              loadingKind === 'language'
                ? t('onboarding.cta.wait')
                : langChosen
                  ? index < SLIDES.length - 1
                    ? t('onboarding.cta.next')
                    : t('onboarding.cta.finish')
                  : t('onboarding.cta.continueLanguage')
            }
            onPress={() => {
              if (langChosen && currentOk) {
                if (index < SLIDES.length - 1) {
                  const next = index + 1;
                  setIndex(next);
                  listRef.current?.scrollToIndex({
                    index: next,
                    animated: true,
                  });
                } else {
                  void syncPermissions();
                }
              } else {
                void requestOne('language');
              }
            }}
            disabled={loadingKind !== null}
          />
        ) : !currentOk ? (
          <Button
            title={
              loadingKind === current.id
                ? t('onboarding.cta.wait')
                : t('onboarding.cta.allow', { title: currentTitle })
            }
            onPress={() => void requestOne(current.id)}
            disabled={loadingKind !== null}
          />
        ) : (
          <Button
            title={
              index < SLIDES.length - 1
                ? t('onboarding.cta.next')
                : t('onboarding.cta.finish')
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

        {current.id !== 'language' ? (
          <Button
            title={t('onboarding.cta.openSettings')}
            variant="secondary"
            onPress={openAppSettings}
          />
        ) : null}
      </View>

      <Text style={styles.footer}>
        {current.id === 'language'
          ? t('onboarding.footer.language')
          : t('onboarding.footer.permission')}
      </Text>
    </View>
  );
}
