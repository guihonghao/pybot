#!/usr/bin/env python
from pybot.vision.image_utils import to_color, to_gray
from pybot.utils.dataset.kitti import KITTIDatasetReader, KITTIStereoGroundTruthDatasetReader

# def eval_kitti_dataset(color=False, **kwargs): 
#     # if color: 
#     #     return KITTIDatasetReader(directory='~/data/dataset/', sequence='08', 
#     #                                     left_template='image_2/%06i.png', right_template='image_3/%06i.png', 
#     #                                     start_idx=0, **kwargs)
#     # else: 
#         return KITTIDatasetReader(directory='~/HD1/data/KITTI/data_stereo_flow/', sequence='training', **kwargs)

def kitti_stereo_training_color_dataset(*args, **kwargs): 
    return KITTIStereoGroundTruthDatasetReader(directory='~/HD1/data/KITTI/data_stereo_flow/training', subdir='colored', **kwargs)

def kitti_stereo_training_dataset(*args, **kwargs): 
    return KITTIStereoGroundTruthDatasetReader(directory='~/HD1/data/KITTI/data_stereo_flow/training', is_2015=False, **kwargs)

def kitti_stereo_2015_training_dataset(*args, **kwargs): 
    return KITTIStereoGroundTruthDatasetReader(directory='~/HD1/data/KITTI/2015/data_scene_flow/training', is_2015=True, **kwargs)
    
def test_color_dataset(*args, **kwargs): 
    return KITTIDatasetReader(directory='~/data/dataset/', sequence='08', 
                              left_template='image_2/%06i.png', right_template='image_3/%06i.png', 
                              start_idx=0, **kwargs)

def test_dataset(*args, **kwargs): 
    return KITTIDatasetReader(directory='~/data/dataset/', sequence='08', **kwargs)

def test_image(color=True, scale=1.0, stereo=False): 
    for l,r in test_dataset().iter_stereo_frames(): 
        l = to_color(l) if color else to_gray(l)
        if not stereo: 
            return l
        else: 
            r = to_color(r) if color else to_gray(r)
            return l,r

def test_video(color=True, stereo=False, **kwargs): 
    for l,r in test_dataset(**kwargs).iter_stereo_frames(): 
        l = to_color(l) if color else to_gray(l)
        if not stereo: 
            yield l
        else: 
            r = to_color(r) if color else to_gray(r)
            yield l,r

if __name__ == "__main__": 
    from pybot.vision.imshow_utils import imshow_cv

    # Test dataset
    dataset = test_dataset()
    for l,r in test_dataset(scale=0.5).iter_stereo_frames(): 
        imshow_cv('left/right', np.vstack([l,r]))

    # Test image
    im = test_image(color=True)
    imshow_cv('image', im)    

    # Test video
    for im in test_video(color=True): 
        print im.shape, im.dtype
        imshow_cv('video', im)

    cv2.waitKey(0)
