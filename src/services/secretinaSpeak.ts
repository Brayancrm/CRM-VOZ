import type { SecretinaLanguage } from '@/services/secretinaLanguage';
import { formatDateTime } from '@/utils/date';

/** Palavra de chamamento por idioma (UI + wake). */
export function wakeGreetingWord(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Hola';
  if (lang === 'en') return 'Hello';
  return 'Olá';
}

export function unnamedContact(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Sin nombre';
  if (lang === 'en') return 'No name';
  return 'Sem nome';
}

export function msgNoContactsFound(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No encontré contactos.';
  if (lang === 'en') return 'I could not find any contacts.';
  return 'Não encontrei contactos.';
}

/** Mensagem falada quando há vários contactos parecidos. */
export function msgAmbiguousSpeak(
  lang: SecretinaLanguage,
  n: number,
  optionLines: string[]
): string {
  if (n > 6) {
    if (lang === 'es') {
      return `Hay ${n} contactos parecidos. Diga el número del 1 al ${n}, o el apellido.`;
    }
    if (lang === 'en') {
      return `There are ${n} similar contacts. Say a number from 1 to ${n}, or the last name.`;
    }
    return `Há ${n} contactos parecidos. Diga o número de 1 a ${n}, ou o sobrenome.`;
  }
  const ask =
    lang === 'es'
      ? 'Diga el número o el apellido.'
      : lang === 'en'
        ? 'Say the number or the last name.'
        : 'Diga o número ou o sobrenome.';
  return `${optionLines.join('. ')}. ${ask}`;
}

export function msgOptionLabel(
  lang: SecretinaLanguage,
  index: number,
  name: string
): string {
  if (lang === 'es') return `Opción ${index}: ${name}`;
  if (lang === 'en') return `Option ${index}: ${name}`;
  return `Opção ${index}: ${name}`;
}

export function msgAmbiguousScreen(
  lang: SecretinaLanguage,
  n: number,
  list: string
): string {
  if (lang === 'es') {
    return `Hay ${n} contactos parecidos. Diga el número (1 a ${n}) o el apellido:\n${list}`;
  }
  if (lang === 'en') {
    return `There are ${n} similar contacts. Say the number (1 to ${n}) or the last name:\n${list}`;
  }
  return `Há ${n} contactos parecidos. Diga o número (1 a ${n}) ou o sobrenome:\n${list}`;
}

export function msgContactChosenMissing(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No encontré el contacto elegido.';
  if (lang === 'en') return 'The chosen contact was not found.';
  return 'Contacto escolhido não encontrado.';
}

export function msgContactNotFound(
  lang: SecretinaLanguage,
  query: string
): string {
  if (lang === 'es') {
    return `No encontré el contacto «${query}». Regístrelo o diga el nombre completo.`;
  }
  if (lang === 'en') {
    return `I could not find the contact “${query}”. Add them or say the full name.`;
  }
  return `Não encontrei o contacto «${query}». Cadastre o nome ou diga o nome completo.`;
}

export function msgPickNotUnderstood(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'No entendí. Diga el número de la lista, por ejemplo 1 o 2, o el apellido.';
  }
  if (lang === 'en') {
    return 'I did not understand. Say the list number, for example 1 or 2, or the last name.';
  }
  return 'Não entendi. Diga o número da lista, por exemplo 1 ou 2, ou o sobrenome.';
}

export function msgRepeatContactName(lang: SecretinaLanguage): string {
  if (lang === 'es') return '¿Puede repetir el nombre del contacto?';
  if (lang === 'en') return 'Can you repeat the contact name?';
  return 'Pode repetir o nome do contacto?';
}

export function msgNoCommand(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No oí ningún comando.';
  if (lang === 'en') return 'I did not hear any command.';
  return 'Não ouvi nenhum comando.';
}

export function msgMissingNote(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Falta el texto de la nota.';
  if (lang === 'en') return 'The note text is missing.';
  return 'Falta o texto da nota.';
}

export function msgNoteCreated(
  lang: SecretinaLanguage,
  name: string
): string {
  if (lang === 'es') return `Nota creada para ${name}.`;
  if (lang === 'en') return `Note created for ${name}.`;
  return `Nota criada para ${name}.`;
}

export function msgScheduled(
  lang: SecretinaLanguage,
  name: string,
  whenMs: number
): string {
  const when = formatDateTime(whenMs, lang);
  if (lang === 'es') return `Agendé una llamada con ${name} para ${when}.`;
  if (lang === 'en') return `I scheduled a call with ${name} for ${when}.`;
  return `Agendei ligação com ${name} para ${when}.`;
}

export function msgBadDateTime(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'No pude interpretar la fecha/hora. Pruebe «mañana a las 15» o una fecha completa.';
  }
  if (lang === 'en') {
    return 'I could not parse the date/time. Try “tomorrow at 3” or a full date.';
  }
  return 'Não consegui interpretar a data/hora. Tente «amanhã às 15» ou uma data completa.';
}

export function msgDateInPast(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'La fecha/hora quedó en el pasado. Diga un horario futuro.';
  }
  if (lang === 'en') {
    return 'That date/time is in the past. Say a future time.';
  }
  return 'A data/hora ficou no passado. Diga um horário futuro.';
}

export function msgNoAction(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No identifiqué ninguna acción.';
  if (lang === 'en') return 'I did not identify any action.';
  return 'Não identifiquei nenhuma acção.';
}

export function msgScheduleNotFound(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'No encontré esa cita. Diga el nombre y el día, por ejemplo «cancela lo de María mañana».';
  }
  if (lang === 'en') {
    return 'I could not find that appointment. Say the name and day, e.g. “cancel the one with Maria tomorrow”.';
  }
  return 'Não encontrei esse agendamento. Diga o nome e o dia, por exemplo «cancela o com a Maria amanhã».';
}

export function msgRescheduleNeedWhen(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'Para remarcar diga la nueva fecha y hora. Ej.: «mueve lo de Pablo al jueves a las 10».';
  }
  if (lang === 'en') {
    return 'To reschedule, say the new date and time. E.g. “move Paulo to Thursday at 10”.';
  }
  return 'Para remarcar diga a nova data e hora. Ex.: «move o do Paulo para quinta às 10».';
}

export function msgRescheduleNotFound(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'No encontré la cita para remarcar. Diga el contacto y, si puede, el día actual.';
  }
  if (lang === 'en') {
    return 'I could not find the appointment to reschedule. Say the contact and, if you can, the current day.';
  }
  return 'Não encontrei o agendamento para remarcar. Diga o contacto e, se puder, o dia actual.';
}

export function msgCancelled(
  lang: SecretinaLanguage,
  name: string,
  whenMs: number
): string {
  const when = formatDateTime(whenMs, lang);
  if (lang === 'es') return `Cancelé la cita con ${name} de ${when}.`;
  if (lang === 'en') return `I cancelled the appointment with ${name} on ${when}.`;
  return `Cancelei o agendamento com ${name} de ${when}.`;
}

export function msgRescheduled(
  lang: SecretinaLanguage,
  name: string,
  whenMs: number
): string {
  const when = formatDateTime(whenMs, lang);
  if (lang === 'es') return `Remarcé ${name} para ${when}.`;
  if (lang === 'en') return `I rescheduled ${name} to ${when}.`;
  return `Remarquei ${name} para ${when}.`;
}

export function msgAmbiguousSchedules(
  lang: SecretinaLanguage,
  parts: string[]
): string {
  if (lang === 'es') {
    return `Encontré varios. ¿Cuál de ellos? ${parts.join('; ')}. Diga el número o más detalles.`;
  }
  if (lang === 'en') {
    return `I found several. Which one? ${parts.join('; ')}. Say the number or more details.`;
  }
  return `Encontrei vários. Qual deles? ${parts.join('; ')}. Diga o número ou mais detalhes.`;
}

export function msgAgendaEmpty(
  lang: SecretinaLanguage,
  rangeLabel: string
): string {
  if (lang === 'es') return `No encontré citas ${rangeLabel}.`;
  if (lang === 'en') return `I found no appointments ${rangeLabel}.`;
  return `Não encontrei agendamentos ${rangeLabel}.`;
}

export function msgAgendaList(
  lang: SecretinaLanguage,
  items: { contactName: string; scheduledAt: number; note: string }[],
  rangeLabel: string
): string {
  if (items.length === 0) return msgAgendaEmpty(lang, rangeLabel);
  if (items.length === 1) {
    const i = items[0];
    const note =
      i.note
        ? lang === 'es'
          ? `, nota: ${i.note}`
          : lang === 'en'
            ? `, note: ${i.note}`
            : `, nota: ${i.note}`
        : '';
    const when = formatDateTime(i.scheduledAt, lang);
    if (lang === 'es') return `Tiene 1: ${i.contactName}, ${when}${note}.`;
    if (lang === 'en') return `You have 1: ${i.contactName}, ${when}${note}.`;
    return `Tem 1: ${i.contactName}, ${when}${note}.`;
  }
  const max = Math.min(items.length, 5);
  const parts = items.slice(0, max).map((i, idx) => {
    const note = i.note ? ` (${i.note})` : '';
    return `${idx + 1}. ${i.contactName}, ${formatDateTime(i.scheduledAt, lang)}${note}`;
  });
  const extra =
    items.length > max
      ? lang === 'es'
        ? ` Y ${items.length - max} más.`
        : lang === 'en'
          ? ` And ${items.length - max} more.`
          : ` E mais ${items.length - max}.`
      : '';
  if (lang === 'es') {
    return `Tiene ${items.length} ${rangeLabel}: ${parts.join('; ')}.${extra}`;
  }
  if (lang === 'en') {
    return `You have ${items.length} ${rangeLabel}: ${parts.join('; ')}.${extra}`;
  }
  return `Tem ${items.length} ${rangeLabel}: ${parts.join('; ')}.${extra}`;
}

export function msgByeAfterSchedule(
  lang: SecretinaLanguage,
  name: string,
  whenLabel: string
): string {
  if (whenLabel) {
    if (lang === 'es') {
      return `De acuerdo. La llamada con ${name} queda para ${whenLabel}. Hasta luego.`;
    }
    if (lang === 'en') {
      return `Alright. The call with ${name} is set for ${whenLabel}. Goodbye.`;
    }
    return `Combinado. A ligação com ${name} fica para ${whenLabel}. Até logo.`;
  }
  if (lang === 'es') return 'De acuerdo. Cita guardada. Hasta luego.';
  if (lang === 'en') return 'Alright. Appointment saved. Goodbye.';
  return 'Combinado. Agendamento guardado. Até logo.';
}

export function msgScheduleNoteSaved(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Nota de la cita guardada. Hasta luego.';
  if (lang === 'en') return 'Appointment note saved. Goodbye.';
  return 'Nota do agendamento guardada. Até logo.';
}

export function msgScheduleMissingForNote(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No encontré la cita para guardar la nota.';
  if (lang === 'en') return 'I could not find the appointment to save the note.';
  return 'Não encontrei o agendamento para guardar a nota.';
}

export function msgProcessFailSpeak(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Tuve un problema al procesar. ¿Puede repetir?';
  if (lang === 'en') return 'I had a problem processing that. Can you repeat?';
  return 'Tive um problema a processar. Pode repetir o pedido?';
}

export function msgNoSpeechHeard(lang: SecretinaLanguage): string {
  if (lang === 'es') {
    return 'No oí nada. Toque en Hablar de nuevo, hable cerca del móvil, o escriba el comando.';
  }
  if (lang === 'en') {
    return 'I heard nothing. Tap Speak again, talk near the phone, or type the command.';
  }
  return 'Não ouvi nada. Toque em Falar de novo, fale perto do telemóvel, ou digite o comando.';
}

export function msgMicStartFail(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'No pude iniciar la voz.';
  if (lang === 'en') return 'Could not start voice recognition.';
  return 'Não foi possível iniciar a voz.';
}

export function msgEmptyNote(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'La nota quedó vacía.';
  if (lang === 'en') return 'The note was empty.';
  return 'A nota ficou vazia.';
}

export function msgScheduleNotFoundShort(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'Cita no encontrada.';
  if (lang === 'en') return 'Appointment not found.';
  return 'Agendamento não encontrado.';
}

export function localeForLang(lang: SecretinaLanguage): string {
  if (lang === 'es') return 'es-ES';
  if (lang === 'en') return 'en-US';
  return 'pt-BR';
}
