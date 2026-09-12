/** Include and exclude keywords (brief section 11). */
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '../../src/theme';
import { Button, Row, Screen, Txt } from '../../src/components/primitives';
import { SettingsGroup, SettingsRow } from '../../src/components/settings';
import { InfoNote } from '../../src/components/states';
import { useSettingsStore } from '../../src/state/settings-store';

function KeywordInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [value, setValue] = useState('');

  const submit = (): void => {
    if (value.trim() === '') return;
    onAdd(value.trim());
    setValue('');
  };

  return (
    <Row gap={theme.spacing.sm} style={{ marginBottom: theme.spacing.sm }}>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        style={{
          flex: 1,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          color: theme.colors.text,
          fontSize: 15,
        }}
      />
      <Button title="Add" onPress={submit} variant="secondary" />
    </Row>
  );
}

export default function KeywordsScreen(): React.JSX.Element {
  const theme = useTheme();
  const state = useSettingsStore();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.layout.screenPadding }}>
        <InfoNote>
          Include keywords add extra targeted queries and are always anchored to the Oil &amp; Gas industry.
          Exclude keywords reject an article before it costs anything to analyse.
        </InfoNote>

        <View style={{ height: theme.spacing.lg }} />

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          Include keywords
        </Txt>
        <KeywordInput placeholder="e.g. an operator or a field name" onAdd={state.addKeyword} />
        <SettingsGroup>
          {state.includeKeywords.length === 0 ? (
            <SettingsRow title="No include keywords" subtitle="The standard Oil & Gas query set is used." />
          ) : (
            state.includeKeywords.map((term) => (
              <SettingsRow
                key={term}
                title={term}
                right={<Button title="Remove" variant="ghost" onPress={() => state.removeKeyword(term)} />}
              />
            ))
          )}
        </SettingsGroup>

        <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
          Exclude keywords
        </Txt>
        <KeywordInput placeholder="e.g. a topic you never want to see" onAdd={state.addExcludedKeyword} />
        <SettingsGroup footer="The built-in exclusion list already removes mining, aviation, road, rail, residential fires, solar, wind and nuclear events.">
          {state.excludeKeywords.length === 0 ? (
            <SettingsRow title="No exclude keywords" subtitle="Only the built-in exclusion rules apply." />
          ) : (
            state.excludeKeywords.map((term) => (
              <SettingsRow
                key={term}
                title={term}
                right={<Button title="Remove" variant="ghost" onPress={() => state.removeExcludedKeyword(term)} />}
              />
            ))
          )}
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}
