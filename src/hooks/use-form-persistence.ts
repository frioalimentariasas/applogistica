
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FieldValues } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    attachments: string[], 
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void
) {
    const { user } = useAuth();
    const { watch, reset, formState: { defaultValues } } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    // This flag prevents saving during programmatic state changes (restore/discard)
    const isProgrammaticChange = useRef(false);
    // This flag prevents overwriting saved attachments on the initial render
    const isInitialAttachmentSave = useRef(true);


    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Save form data to localStorage on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') return;

        const subscription = watch((value) => {
            if (isProgrammaticChange.current) {
                return;
            }
            localStorage.setItem(storageKey, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [watch, getStorageKey]);

    // Save attachments to IndexedDB on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        // Prevent overwriting attachments on the first render before the user can restore
        if (isInitialAttachmentSave.current) {
            isInitialAttachmentSave.current = false;
            return;
        }

        if (isProgrammaticChange.current) return;

        const attachmentsKey = `${storageKey}-attachments`;
        idb.set(attachmentsKey, attachments).catch(err => {
            console.error("Failed to save attachments to IndexedDB", err);
        });
    }, [attachments, getStorageKey]);

    // Check for saved data on mount
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') return;

        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            // A short delay to allow the form to fully initialize before showing the dialog
            setTimeout(() => setRestoreDialogOpen(true), 100);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey]);

    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        isProgrammaticChange.current = true;
        setRestoreDialogOpen(false);

        try {
            const attachmentsKey = `${storageKey}-attachments`;
            const savedData = localStorage.getItem(storageKey);
            const savedAttachments = await idb.get<string[]>(attachmentsKey);

            if (savedAttachments) {
                setAttachments(savedAttachments);
            }

            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // Ensure date objects are correctly parsed from ISO strings
                Object.keys(parsedData).forEach(key => {
                    const value = parsedData[key];
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                         parsedData[key] = new Date(value);
                    }
                });
                reset(parsedData);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            // Allow saving again after a short delay to let all state updates settle
            setTimeout(() => { isProgrammaticChange.current = false; }, 200);
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const discardDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        isProgrammaticChange.current = true;
        setRestoreDialogOpen(false);

        try {
            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);
            
            reset(defaultValues as T); 
            setAttachments([]);
            toast({ title: "Borrador Descartado" });
        } catch (e) {
            console.error("Failed to discard draft", e);
        } finally {
            // Allow saving again after a short delay
            setTimeout(() => { isProgrammaticChange.current = false; }, 200);
        }
    }, [getStorageKey, reset, defaultValues, setAttachments, toast]);
    
    const clearDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        const attachmentsKey = `${storageKey}-attachments`;
        localStorage.removeItem(storageKey);
        await idb.del(attachmentsKey);
    }, [getStorageKey]);

    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: discardDraft,
        clearDraft
    };
}
