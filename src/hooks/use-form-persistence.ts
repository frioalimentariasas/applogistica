
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    originalDefaultValues: T,
    attachments: string[], 
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void,
    isEditMode = false
) {
    const { user } = useAuth();
    const { reset, getValues } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Use useWatch to get updates from the form values
    const watchedValues = useWatch({ control: form.control });

    // --- SAVE DRAFT LOGIC ---
    useEffect(() => {
        const storageKey = getStorageKey();
        // Do not save drafts in edit mode.
        if (isEditMode || !storageKey) {
            return;
        }

        try {
            // Get the current form values
            const currentValues = getValues();
            
            // Save text fields to localStorage (fast, synchronous)
            localStorage.setItem(storageKey, JSON.stringify(currentValues));
            
            // Save attachments to IndexedDB (asynchronous)
            const attachmentsKey = `${storageKey}-attachments`;
            idb.set(attachmentsKey, attachments).catch(err => {
                console.error("Failed to save attachments draft to IDB", err);
            });
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    // This effect runs on every change to form values or attachments, ensuring the draft is always up-to-date.
    }, [watchedValues, attachments, isEditMode, getStorageKey, getValues]);
    

    // --- RESTORE DRAFT LOGIC ---
    useEffect(() => {
        if (isEditMode) {
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') {
            return;
        }

        const checkData = async () => {
            try {
                const savedDataJSON = localStorage.getItem(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);

                let hasMeaningfulData = false;
                if (savedDataJSON) {
                    const savedData = JSON.parse(savedDataJSON);
                    // Heuristic: if a required field has a value, or items exist,
                    // then the form is not blank and we should offer to restore.
                    if (savedData.pedidoSislog || savedData.cliente || (savedData.items && savedData.items.some((i: any) => i.descripcion))) {
                        hasMeaningfulData = true;
                    }
                }
                
                if (hasMeaningfulData || (savedAttachments && savedAttachments.length > 0)) {
                    setRestoreDialogOpen(true);
                }
            } catch (e) {
                console.error("Failed to check for draft", e);
            }
        };

        const timer = setTimeout(checkData, 100);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey, isEditMode]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                Object.keys(parsedData).forEach(key => {
                    const value = parsedData[key];
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                         parsedData[key] = new Date(value);
                    }
                });
                reset(parsedData);
            }

            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const clearDraft = useCallback(async (showToast = false) => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);
            
            if (showToast) {
                 toast({ title: "Borrador Descartado" });
            }
        } catch (e) {
            console.error("Failed to clear draft", e);
             if (showToast) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
            }
        }
    }, [getStorageKey, toast]);

    const discardDraft = useCallback(async () => {
        // Clear draft storage *before* resetting the form state
        await clearDraft(true);
        reset(originalDefaultValues);
        setAttachments([]);
        setRestoreDialogOpen(false);
    }, [reset, originalDefaultValues, setAttachments, clearDraft]);
    
    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: discardDraft,
        clearDraft: () => clearDraft(false)
    };
}
