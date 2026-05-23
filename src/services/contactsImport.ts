import * as Contacts from 'expo-contacts';
import { createContact, findContactByPhone } from '@/db/repositories/contacts';
import { normalizePhoneFromDevice } from '@/utils/phone';
import { createId } from '@/utils/id';

export async function importDeviceContacts(): Promise<number> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permissão de contatos negada.');
  }
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
  });
  let imported = 0;
  for (const c of data) {
    if (!c.name || !c.phoneNumbers?.length) continue;
    for (const phone of c.phoneNumbers) {
      if (!phone.number) continue;
      const phone_normalized = normalizePhoneFromDevice(phone.number);
      if (!phone_normalized) continue;
      const existing = await findContactByPhone(phone_normalized);
      if (existing) continue;
      await createContact({
        id: createId(),
        name: c.name,
        phone_normalized,
      });
      imported += 1;
      break;
    }
  }
  return imported;
}
