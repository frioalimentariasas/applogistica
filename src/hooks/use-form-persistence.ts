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
    
    // This ref prevents saving the form's initial (blank) state over a saved draft before the user has a chance to restore it.
    const hasCheckedForDraft = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Use a ref for attachments to avoid stale closures in callbacks
    const attachmentsRef = useRef(attachments);
    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Use useWatch to get updates from the form values
    const watchedValues = useWatch({ control: form.control });
    
    const saveDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey || isEditMode) return;
        
        try {
            const currentValues = getValues();
            localStorage.setItem(storageKey, JSON.stringify(currentValues));

            const attachmentsKey = `${storageKey}-attachments`;
            await idb.set(attachmentsKey, attachmentsRef.current);
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    }, [getStorageKey, isEditMode, getValues]);


    // --- SAVE DRAFT LOGIC ---
    useEffect(() => {
        // Don't save anything until we've checked for an existing draft and decided whether to restore it.
        if (!hasCheckedForDraft.current) {
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveDraft();
        }, 500); // Debounce save by 500ms

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [watchedValues, attachments, saveDraft]);

    // --- RESTORE DRAFT LOGIC ---
    useEffect(() => {
        // In edit mode, we don't deal with drafts.
        if (isEditMode) {
            hasCheckedForDraft.current = true;
            return;
        }

        // Wait until user is authenticated.
        if (!user) {
            return;
        }
        
        // This effect should only run once when the user is available.
        if (hasCheckedForDraft.current) {
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        const checkData = async () => {
            try {
                const savedDataJSON = localStorage.getItem(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);
                
                let hasMeaningfulData = false;
                if (savedDataJSON) {
                    const savedData = JSON.parse(savedDataJSON);
                    const hasTextFields = savedData.pedidoSislog || savedData.cliente || savedData.nombreCliente || savedData.conductor || savedData.nombreConductor;
                    // Check if items/products array has more than the initial empty item, or if the first item has been filled.
                    const hasItems = savedData.items && (savedData.items.length > 1 || (savedData.items.length === 1 && savedData.items[0].descripcion?.trim()));
                    const hasProducts = savedData.productos && (savedData.productos.length > 1 || (savedData.productos.length === 1 && savedData.productos[0].descripcion?.trim()));

                    if (hasTextFields || hasItems || hasProducts) {
                        hasMeaningfulData = true;
                    }
                }
                
                if (hasMeaningfulData || (savedAttachments && savedAttachments.length > 0)) {
                    setRestoreDialogOpen(true);
                } else {
                    // No meaningful draft found, so we can enable saving.
                    hasCheckedForDraft.current = true;
                }
            } catch (e) {
                console.error("Failed to check for draft", e);
                // On error, enable saving to prevent getting stuck.
                hasCheckedForDraft.current = true;
            }
        };

        // Use a short delay to ensure other initializations are complete.
        const timer = setTimeout(checkData, 100);
        return () => clearTimeout(timer);
    }, [isEditMode, user, getStorageKey, setAttachments, toast, reset]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // Convert date strings back to Date objects
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
            hasCheckedForDraft.current = true; // Enable saving after restoring.
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const clearDraft = useCallback(async (showToast = false) => {
        // Stop any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
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
        // Stop any pending save that might be about to fire
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        await clearDraft(true);
        reset(originalDefaultValues);
        setAttachments([]);
        setRestoreDialogOpen(false);
        hasCheckedForDraft.current = true; // Enable saving for the new blank form.
    }, [clearDraft, reset, originalDefaultValues, setAttachments]);
    
    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: discardDraft,
        clearDraft: () => clearDraft(false)
    };
}
