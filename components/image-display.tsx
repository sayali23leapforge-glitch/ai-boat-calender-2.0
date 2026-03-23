/**
 * Image Display Component
 * Shows images sent via iMessage with extracted dates and events
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Trash2, CheckCircle2, X, ZoomIn } from 'lucide-react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ImageData {
  id: string;
  imageUrl: string;
  extractedText: string;
  extractedDates: string[];
  extractedEvents: Array<{
    title: string;
    date: string;
    description: string;
  }>;
  uploadedAt: number;
  processed: boolean;
  sender: string;
}

interface ImageDisplayProps {
  image: ImageData;
  onDelete?: (imageId: string) => void;
  onCreateEvent?: (event: any) => void;
}

export function ImageDisplay({
  image,
  onDelete,
  onCreateEvent,
}: ImageDisplayProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Image Preview */}
        <div 
          className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
          onClick={() => setIsModalOpen(true)}
        >
          <Image
            src={image.imageUrl}
            alt="Uploaded image"
            fill
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized // Allow external URLs
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {image.processed && (
            <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Extracted Info */}
        <div className="flex flex-col gap-3">
          {/* Upload Date/Time */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600 font-medium">Uploaded</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(image.uploadedAt).toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              })}
            </p>
            <p className="text-sm text-gray-700">
              {new Date(image.uploadedAt).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit'
              })}
            </p>
          </div>

          {/* Sender Info */}
          <div>
            <p className="text-sm text-gray-600">From: <span className="font-semibold">{image.sender}</span></p>
          </div>

          {/* Extracted Dates */}
          {image.extractedDates && image.extractedDates.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Dates Found ({image.extractedDates.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {image.extractedDates.map((date) => (
                  <Badge key={date} variant="secondary">
                    {date}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Extracted Events */}
          {image.extractedEvents && image.extractedEvents.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Events</h4>
              <div className="space-y-2">
                {image.extractedEvents.map((event, idx) => (
                  <div
                    key={idx}
                    className="text-sm p-2 bg-blue-50 rounded border border-blue-200"
                  >
                    <p className="font-medium text-blue-900">{event.title}</p>
                    <p className="text-xs text-blue-700">{event.date}</p>
                    {event.description && (
                      <p className="text-xs text-blue-600 mt-1">
                        {event.description}
                      </p>
                    )}
                    {onCreateEvent && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCreateEvent(event)}
                        className="mt-2 text-xs"
                      >
                        Add to Calendar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-auto">
            {onDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(image.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Extracted Text Preview */}
      {image.extractedText && (
        <div className="border-t p-4 bg-gray-50">
          <h4 className="text-sm font-semibold mb-2">Extracted Text</h4>
          <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap">
            {image.extractedText}
          </p>
        </div>
      )}
    </Card>

    {/* Full Size Image Modal */}
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0">
        <DialogHeader className="absolute top-4 left-4 z-10 bg-black/70 text-white px-4 py-2 rounded-lg">
          <DialogTitle className="text-white">Image Preview</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center bg-black/90">
          <Image
            src={image.imageUrl}
            alt="Full size image"
            fill
            className="object-contain"
            unoptimized
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/**
 * Image Gallery for multiple uploads
 */
interface ImageGalleryProps {
  images: ImageData[];
  onDelete?: (imageId: string) => void;
  onCreateEvent?: (event: any) => void;
  loading?: boolean;
}

export function ImageGallery({
  images,
  onDelete,
  onCreateEvent,
  loading,
}: ImageGalleryProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500">Processing images...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No images uploaded yet</p>
        <p className="text-sm text-gray-400">
          Send an image via iMessage and it will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {images.map((image) => (
        <ImageDisplay
          key={image.id}
          image={image}
          onDelete={onDelete}
          onCreateEvent={onCreateEvent}
        />
      ))}
    </div>
  );
}
