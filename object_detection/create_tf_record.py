
import hashlib
import io
import logging
import os
import random
import re
import sys

import contextlib2
from lxml import etree
import numpy as np
import PIL.Image
import tensorflow as tf

from object_detection.dataset_tools import tf_record_creation_util
from object_detection.utils import dataset_util
from object_detection.utils import label_map_util

PATH_TO_OBJECT_DETECTION = '/Users/kiril/code/tensorflow/models/research/'
sys.path.insert(0, PATH_TO_OBJECT_DETECTION)
from object_detection.utils import dataset_util
