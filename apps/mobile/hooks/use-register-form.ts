import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { useAppDispatch } from '@/hooks/use-redux';
import { setCredentials, setLoading } from '@/stores/slices/auth-slice';
import { authService } from '@/services/auth';

export interface RegisterFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function useRegisterForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhoneNum] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<RegisterFormErrors>({});

  const clearError = useCallback(
    (field: keyof RegisterFormErrors) => {
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors],
  );

  const validate = useCallback((): boolean => {
    const newErrors: RegisterFormErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!firstName.trim()) newErrors.firstName = t('auth.firstNameRequired');
    if (!lastName.trim()) newErrors.lastName = t('auth.lastNameRequired');
    if (!email || !emailRegex.test(email))
      newErrors.email = t('auth.invalidEmail');
    if (!password) {
      newErrors.password = t('auth.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('auth.passwordMinLength');
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('auth.passwordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [firstName, lastName, email, password, confirmPassword, t]);

  const handleRegister = useCallback(async () => {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    dispatch(setLoading(true));

    try {
      const response = await authService.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password,
        phone: phone || undefined,
      });
      if (response.success && response.data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        dispatch(
          setCredentials({
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken ?? '',
            user: response.data.user,
          }),
        );
        router.replace('/(client)/(tabs)/home');
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('common.error'), t('auth.registerError'));
    } finally {
      setIsLoading(false);
      dispatch(setLoading(false));
    }
  }, [validate, firstName, lastName, email, password, phone, dispatch, router, t]);

  return {
    fields: { firstName, lastName, email, phone, password, confirmPassword, showPassword },
    setters: { setFirstName, setLastName, setEmail, setPhoneNum, setPassword, setConfirmPassword, setShowPassword },
    errors,
    clearError,
    loading,
    handleRegister,
  };
}
